import os
import json
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

# Hyperparameters
# (we’ll ignore Z‑offset for now so both shapes sit at Z=0)
width = .1

# Locate and load your JSON
script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, "data.json")

with open(file_path, "r") as f:
    data = json.load(f)

paths = data.get("paths", [])
assert len(paths) >= 2, "Expect at least two paths in your JSON"

# 1) Gather all X/Y to compute centering & uniform scale
all_x = [pt["x"] for path in paths for pt in path["points"]]
all_y = [pt["y"] for path in paths for pt in path["points"]]

min_x, max_x = min(all_x), max(all_x)
min_y, max_y = min(all_y), max(all_y)

center_x = (min_x + max_x) / 2
center_y = (min_y + max_y) / 2
scale_x = max_x - min_x
scale_y = max_y - min_y
scale = max(scale_x, scale_y)  # preserve aspect

# 2) Normalize each point into [−0.5, +0.5] and give it a z
def normalize_point(p):
    p["x"] = (p["x"] - center_x) / scale
    p["y"] = (p["y"] - center_y) / scale
    p["z"] = 0.0   # we’ll override below, but start at zero
    return p

for path in paths:
    path["points"] = [normalize_point(pt) for pt in path["points"]]

# 3) Position shapes along Z so they differ by the 'width' hyperparameter
for pt in paths[0]["points"]:
    pt["z"] = 0.0
for pt in paths[1]["points"]:
    pt["z"] = -width

# Center each path at the origin in X and Y so they perfectly overlap
for idx in (0, 1):
    pts = paths[idx]["points"]
    avg_x = sum(p["x"] for p in pts) / len(pts)
    avg_y = sum(p["y"] for p in pts) / len(pts)
    for p in pts:
        p["x"] -= avg_x
        p["y"] -= avg_y

# 4) Plot them in 3D with all axes from -0.5 to +0.5
fig = plt.figure(figsize=(8, 6))
ax = fig.add_subplot(111, projection='3d')

colors = ["C0", "C1"]
for i, path in enumerate(paths[:2]):
    xs = [pt["x"] for pt in path["points"]]
    ys = [pt["y"] for pt in path["points"]]
    zs = [pt["z"] for pt in path["points"]]
    ax.plot(xs, ys, zs, color=colors[i], label=f"Path {i}")

ax.set_xlim(-0.5, 0.5)
ax.set_ylim(-0.5, 0.5)
ax.set_zlim(-0.5, 0.5)
ax.set_xlabel("X")
ax.set_ylabel("Y")
ax.set_zlabel("Z")
ax.set_title("Both Paths Centered at (0,0,0) in a ±0.5 Box")
ax.legend()
plt.tight_layout()
plt.show()