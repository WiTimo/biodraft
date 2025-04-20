import os
import json
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
import numpy as np

def unwrap_points_safe(points, max_depth=5):
    depth = 0
    while isinstance(points, dict) and "points" in points:
        points = points["points"]
        depth += 1
        if depth > max_depth:
            break
    return points

# Hyperparameters
width = .1  # Z offset between front and back

# Load JSON
script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, "data.json")

with open(file_path, "r") as f:
    data = json.load(f)

paths = data.get("paths", [])
for i in range(len(paths)):
    paths[i]["points"] = unwrap_points_safe(paths[i]["points"])
assert len(paths) >= 4, "Expect at least four paths in your JSON"

# 1) Normalize for uniform scale and centering
all_x = [pt["x"] for path in paths for pt in path["points"]]
all_y = [pt["y"] for path in paths for pt in path["points"]]

center_x = (min(all_x) + max(all_x)) / 2
center_y = (min(all_y) + max(all_y)) / 2
scale = max(max(all_x) - min(all_x), max(all_y) - min(all_y))

def normalize_point(p):
    return {
        "x": (p["x"] - center_x) / scale,
        "y": (p["y"] - center_y) / scale,
        "z": 0.0
    }

for path in paths:
    path["points"] = [normalize_point(pt) for pt in path["points"]]

# 2) Position front and back along Z axis
for pt in paths[0]["points"]:
    pt["z"] = 0.0
for pt in paths[1]["points"]:
    pt["z"] = -width

# 3) Align back to front in XY
def average_xy(path):
    xs = [p["x"] for p in path["points"]]
    ys = [p["y"] for p in path["points"]]
    return sum(xs) / len(xs), sum(ys) / len(ys)

avg0_x, avg0_y = average_xy(paths[0])
avg1_x, avg1_y = average_xy(paths[1])
dx = avg0_x - avg1_x
dy = avg0_y - avg1_y
for p in paths[1]["points"]:
    p["x"] += dx
    p["y"] += dy

# 4) Wrap sleeves around cylinder
def wrap_sleeve_around_cylinder(points, arc_angle_deg=270, radius=0.1, z_height=0.0):
    # Wrap sleeve around a cylinder surface (arc_angle_deg defines how much of the circle to use)
    arc_angle_rad = np.radians(arc_angle_deg)
    xs = [pt["x"] for pt in points]
    min_x, max_x = min(xs), max(xs)
    arc_len = max_x - min_x

    wrapped = []
    for pt in points:
        t = (pt["x"] - min_x) / arc_len  # Normalize position along arc
        angle = t * arc_angle_rad
        new_x = radius * np.cos(angle)
        new_y = radius * np.sin(angle)
        wrapped.append({
            "x": new_x,
            "y": new_y,
            "z": z_height + pt["y"] * 0.5  # preserve vertical shape
        })
    return wrapped

# Use points from the front and back shoulders as sleeve origins
paths[2]["points"] = wrap_sleeve_around_cylinder(paths[2]["points"], arc_angle_deg=270, radius=0.08, z_height=0.0)
paths[3]["points"] = wrap_sleeve_around_cylinder(paths[3]["points"], arc_angle_deg=270, radius=0.08, z_height=-0.05)

# 5) Plotting
fig = plt.figure(figsize=(8, 6))
ax = fig.add_subplot(111, projection='3d')
colors = ["C0", "C1", "C2", "C3"]

for i, path in enumerate(paths[:4]):
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
ax.set_title("T-Shirt with CLO3D-style Cylindrical Sleeves")
ax.legend()
plt.tight_layout()
plt.show()