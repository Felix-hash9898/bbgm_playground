"""Generated draft classes (sim/r164_classes.test.ts) against real ones: size over time, by draft age, and skill profile."""
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean

import pandas as pd

HERE = Path(__file__).resolve().parent.parent
R = pd.read_parquet(HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
R["da"] = (R.draftYear - R.bornYear).clip(19, 22)
R["k"] = R.season - R.draftYear
K = (1, 2, 3, 4, 6, 8, 10, 12, 14)
SKILLS = ("hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb")


def show(name, at, total, young, skills):
    print(f"\n{name}")
    print("  50+/60+/65+/70+ per class by year", *(f"{k}:" + "/".join(f"{x:.0f}" if x >= 9.5 else f"{x:.1f}" for x in at(k)) for k in K))
    print("  player seasons 50+/60+/65+/70+", total)
    for a in (19, 20, 21, 22):
        print(f"  age {a}{'+' if a == 22 else ''}", young(a))
    for k in (1, 4, 7):
        print(f"  skills best 30 year {k}", *(f"{s}:{v:.0f}" for s, v in zip(SKILLS, skills(k))))


# Real: level counts use drafts 2004-16 where the season exists, careers 2004-10, rookies and skills 2012-25.
def real_at(k):
    years = [d for d in range(2004, 2017) if d + k <= 2026]
    q = [R[(R.draftYear == d) & (R.k == k)].ovr for d in years]
    return [mean((x >= lv).sum() for x in q) for lv in (50, 60, 65, 70)]


old = R[R.draftYear.between(2004, 2010) & R.k.between(1, 16)]
new = R[R.draftYear.between(2012, 2025) & (R.k == 1)]
t15 = new.sort_values("ovr", ascending=False).groupby("draftYear").head(15)


def real_young(a):
    q, c = new[new.da == a], old[old.da == a]
    return f"top15 share {(t15.da == a).mean():.2f} year1 50+ {(q.ovr >= 50).sum() / 14:.1f} | seasons 50+ {(c.ovr >= 50).sum() / 7:.0f} 60+ {(c.ovr >= 60).sum() / 7:.1f} 65+ {(c.ovr >= 65).sum() / 7:.1f} 70+ {(c.ovr >= 70).sum() / 7:.1f}"


def real_skills(k):
    q = R[R.draftYear.between(2012, 2025) & (R.k == k)].sort_values("ovr", ascending=False).groupby("draftYear").head(30)
    return [q[s].mean() for s in SKILLS]


# Seasons at 50+ per class while aged 22 or less, and 33 or more (real drafts old enough to have reached that age).
R["yrs"] = R.season - R.bornYear
y22 = R[R.draftYear.between(2012, 2022) & R.k.ge(1) & (R.yrs <= 22)]
y33 = R[R.draftYear.between(2000, 2010) & R.k.ge(1) & R.yrs.between(33, 38)]
print("REAL seasons per class aged <=22: 50+", round((y22.ovr >= 50).sum() / 11, 1), "55+", round((y22.ovr >= 55).sum() / 11, 1),
      "| aged 33-38: 50+", round((y33.ovr >= 50).sum() / 11, 1), "55+", round((y33.ovr >= 55).sum() / 11, 1))
show("REAL", real_at, [round(int((old.ovr >= lv).sum()) / 7, 1) for lv in (50, 60, 65, 70)], real_young, real_skills)
arms = defaultdict(lambda: defaultdict(list))
for path in sys.argv[1:]:
    with (gzip.open if path.endswith("gz") else open)(path, "rt") as f:
        for r in json.load(f):
            arms[r["arm"]][r["c"]].append(r)
for arm, classes in arms.items():
    cs = list(classes.values()); n = len(cs)
    t = [p for c in cs for p in sorted(c, key=lambda p: -p["path"][1])[:15]]
    every = [p for c in cs for p in c]
    num = lambda q, lv: sum(x >= lv for p in q for x in p["path"][1:17]) / n

    def young(a):
        q = [p for p in every if min(22, max(19, p["age"])) == a]
        return f"top15 share {mean(min(22, max(19, p['age'])) == a for p in t):.2f} year1 50+ {sum(p['path'][1] >= 50 for p in q) / n:.1f} | seasons 50+ {num(q, 50):.0f} 60+ {num(q, 60):.1f} 65+ {num(q, 65):.1f} 70+ {num(q, 70):.1f} | n {len(q) / n:.0f} year1 {mean(p['path'][1] for p in q):.1f}"

    def skills(k):
        q = [p["skills"][str(k)] for c in cs for p in sorted(c, key=lambda p: -p["path"][k])[:30]]
        return [mean(x[s] for x in q) for s in SKILLS]

    aged = lambda lo, hi, lv: round(sum(lo <= p["age"] + k <= hi and x >= lv for p in every for k, x in enumerate(p["path"]) if k) / n, 1)
    print("\n", arm, "seasons aged <=22: 50+", aged(0, 22, 50), "55+", aged(0, 22, 55), "| aged 33-38: 50+", aged(33, 38, 50), "55+", aged(33, 38, 55))
    show(arm, lambda k: [mean(sum(p["path"][k] >= lv for p in c) for c in cs) for lv in (50, 60, 65, 70)],
         [round(num(every, lv), 1) for lv in (50, 60, 65, 70)], young, skills)
