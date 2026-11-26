"""The frozen POT pilot's outcome checks with exact counts and preseason availability."""
from fractions import Fraction
from statistics import mean, pstdev

from r164_final_score import row


def player_seasons(world):
    by_player = {}
    for player in world["players"]:
        by_season = {}
        for stat in player["stats"]:
            if stat["tid"] < 0:
                continue
            season = stat["season"]
            dest = by_season.setdefault(season, {k: 0 for k in ("min", "fga", "fta", "pts")})
            for field in dest:
                dest[field] += stat[field]
        by_player[player["pid"]] = by_season
    return by_player


def season_outcomes(world, season, opening_market):
    seasons = player_seasons(world)
    minutes = lambda p, year: seasons[p["pid"]].get(year, {}).get("min", 0)
    picks = [p for p in world["players"] if p["draft"]["year"] == season - 1 and p["draft"]["round"] == 1]
    if season == world["start"]:
        market = opening_market
    else:
        market = next(snapshot["market"] for snapshot in world["snapshots"] if snapshot["season"] == season)
    # Same earliest regular-season evidence used by the original health gate.
    healthy_fa = {r[0] for r in market if r[1] == -1 and r[4] == 0}
    idle = 0
    young = []
    for p in world["players"]:
        ratings = [r for r in p["ratings"] if r["season"] == season]
        if p["pid"] in healthy_fa and minutes(p, season - 1) >= 1000 and minutes(p, season) == 0 and ratings and ratings[-1]["ovr"] >= 62:
            idle += 1
        if p["real"] and 19 <= season - p["born"] <= 24 and p["draft"]["year"] < season and ratings:
            young.append(minutes(p, season))
    total = {key: sum(box.get(season, {}).get(key, 0) for box in seasons.values()) for key in ("fga", "fta", "pts")}
    snap = next(r for r in world["snapshots"] if r["season"] == season + 1)
    wins = [w / (w + l + t) for _, w, l, t, *_ in snap["teamRecords"] if w + l + t]
    return dict(rookies=Fraction(sum(minutes(p, season) >= 500 for p in picks), len(picks)),
                young_minutes=mean(young), idle=idle, win_sd=pstdev(wins),
                ts=total["pts"] / (2 * (total["fga"] + .44 * total["fta"])))


def calibration_rows(world, ledger):
    candidates = {r["pid"]: r for r in ledger}
    peak = []
    end = world["start"] + world["years"] - 1
    for player in world["players"]:
        if player["pid"] not in candidates:
            continue
        receipt = candidates[player["pid"]]
        start = world["start"]
        horizon = start + (29 - receipt["age"])
        if horizon > end:
            continue
        first_by_season = {}
        for r in player["ratings"]:
            if start <= r["season"] <= horizon:
                first_by_season.setdefault(r["season"], r["ovr"])
        # Count retirees' known peaks on the same horizon. No ranking or future minutes selection.
        if not first_by_season:
            raise ValueError("Opening POT ledger missing its corresponding player ratings")
        peak.append((receipt["age"], receipt["before"], receipt["after"], max(first_by_season.values())))
    return peak


def loss(error):
    return error / 4 if error >= 0 else -3 * error / 4


def gates(window, pairs, *, require_calibration=True):
    """pairs: (base run, treated run, common opening market, treated potential ledger)."""
    start = int(window)
    report, rows = {}, []
    for year in (start, start + 1):
        outcomes = [(season_outcomes(base, year, market), season_outcomes(treated, year, market))
                    for base, treated, market, _ in pairs]
        difference = {k: mean(b[k] - a[k] for a, b in outcomes) for k in outcomes[0][0]}
        report[year] = {k: float(v) for k, v in difference.items()}
        for key, bound in (("rookies", Fraction(-1, 20)), ("idle", 0), ("win_sd", .025), ("ts", .006)):
            v = difference[key]
            passed = v >= bound if key == "rookies" else abs(v) <= bound if key in ("ts", "win_sd") else v <= bound
            operator = ">=" if key == "rookies" else "|difference| <=" if key in ("ts", "win_sd") else "<="
            rows.append(row(window, "POT", f"{year} {key}: T minus U", float(v), f"{operator} {bound}", passed))
        if year == start:
            v = difference["young_minutes"]
            rows.append(row(window, "POT", f"{year} young_minutes: T minus U", v, ">= -60", v >= -60))

    observed = [r for _, treated, _, ledger in pairs for r in calibration_rows(treated, ledger)]
    if require_calibration and not observed:
        raise ValueError("Missing observed career peaks for POT calibration")
    if observed:
        a = mean(loss(before - peak) for _, before, _, peak in observed)
        b = mean(loss(after - peak) for _, _, after, peak in observed)
        ratio = b / a if a > 0 else (0 if b == 0 else float("inf"))
        young = [(after, peak) for age, _, after, peak in observed if age <= 22]
        older = [(before, after, peak) for age, before, after, peak in observed if age >= 23]
        exceeded = mean(after < peak for after, peak in young)
        delta = mean(loss(after - peak) - loss(before - peak) for before, after, peak in older)
        control = [r for base, _, _, ledger in pairs for r in calibration_rows(base, ledger)]
        report["calibration"] = dict(player_paths=len(observed), before_loss=a, after_loss=b, loss_ratio=ratio,
                                     exceeded_young=exceeded, older_loss_delta=delta,
                                     control_player_paths=len(control),
                                     control_before_loss=mean(loss(before - peak) for _, before, _, peak in control),
                                     control_after_loss=mean(loss(after - peak) for _, _, after, peak in control))
        rows += [row(window, "POT", "recorded peak quantile loss ratio", ratio, "<= .85", ratio <= .85),
                 row(window, "POT", "age 19-22 share exceeding forecast peak", exceeded, ".15 - .32", .15 <= exceeded <= .32),
                 row(window, "POT", "age 23-26 quantile loss change", delta, "<= 0", delta <= 0)]
    return rows, report
