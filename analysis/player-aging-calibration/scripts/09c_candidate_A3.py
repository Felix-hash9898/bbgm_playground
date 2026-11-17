"""Round-2 hybrid candidate A3, motivated by the full-league experiment (not by NBA targets directly):
A2r's calcBaseChange for ages <= 31 (reduced young growth, earlier plateau end) and the unchanged Playground
values from age 32 (Playground matched real veteran decline, survival and age structure best in the full
league, while A2r's softer 36-40 value kept veterans too long). Writes A3 into sim/formulas/candidate_specs.json.
"""
from __future__ import annotations

import copy
import json

import numpy as np

from bbgm_dev import KEYS
from cand_specs import PLAYGROUND, T, develop_spec, look
from common import HERE

path = HERE / "sim" / "formulas" / "candidate_specs.json"
specs = json.loads(path.read_text())
A3 = copy.deepcopy(PLAYGROUND)
A3["base"] = T([22, 25, 27, 28, 31, 35, 40, 43], [1.1, 0.3, -0.2, -0.6, -1.3, -2.0, -3.0, -4.0, -5.0])
specs["A3"] = A3
path.write_text(json.dumps(specs, indent=1) + "\n")
ages = np.arange(19, 46)
a2r, pg = specs["A2r"]["base"], PLAYGROUND["base"]
assert all(look(A3["base"], a) == look(a2r, a) for a in ages if a <= 31)
assert all(look(A3["base"], a) == look(pg, a) for a in ages if a >= 32)
assert all(A3["mods"][k] == PLAYGROUND["mods"][k] for k in KEYS)
print("A3 base by age:", {int(a): float(look(A3["base"], a)) for a in [20, 22, 24, 26, 28, 30, 32, 35, 38, 42, 45]})
