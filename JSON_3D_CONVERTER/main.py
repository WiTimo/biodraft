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

# Extract connection links
links = data.get("links", [])

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
            "z": z_height + pt["y"] * 0.5,  # preserve vertical shape
            "_originalXY": (pt["x"], pt["y"])  # Save original 2D position
        })
    return wrapped

# Use points from the front and back shoulders as sleeve origins
paths[2]["points"] = wrap_sleeve_around_cylinder(paths[2]["points"], arc_angle_deg=270, radius=0.08, z_height=0.0)
paths[3]["points"] = wrap_sleeve_around_cylinder(paths[3]["points"], arc_angle_deg=270, radius=0.08, z_height=-0.05)

def transform_sleeve(points, rotation_deg, translation_vec):
    angle = np.radians(rotation_deg)
    rot_matrix = np.array([
        [np.cos(angle), -np.sin(angle), 0],
        [np.sin(angle),  np.cos(angle), 0],
        [0, 0, 1]
    ])
    transformed = []
    for pt in points:
        vec = np.array([pt["x"], pt["y"], pt["z"]])
        new_vec = rot_matrix @ vec + translation_vec
        new_pt = pt.copy()
        new_pt["x"], new_pt["y"], new_pt["z"] = new_vec
        transformed.append(new_pt)
    return transformed

# Apply rotation and offset to sleeves
paths[2]["points"] = transform_sleeve(paths[2]["points"], rotation_deg=-90, translation_vec=np.array([-0.25, 0.0, 0.0]))
paths[3]["points"] = transform_sleeve(paths[3]["points"], rotation_deg=90, translation_vec=np.array([0.25, 0.0, -0.05]))

# 5) Plotting
fig = plt.figure(figsize=(8, 6))
ax = fig.add_subplot(111, projection='3d')
colors = ["C0", "C1", "C2", "C3"]

for i, path in enumerate(paths[:4]):
    xs = [pt["x"] for pt in path["points"]]
    ys = [pt["y"] for pt in path["points"]]
    zs = [pt["z"] for pt in path["points"]]
    ax.plot(xs, ys, zs, color=colors[i], label=f"Path {i}")

def find_nearest_point_index(points, x_target, y_target):
    return min(
        range(len(points)),
        key=lambda i: (
            (points[i].get("_originalXY", (points[i]["x"], points[i]["y"]))[0] - x_target) ** 2 +
            (points[i].get("_originalXY", (points[i]["x"], points[i]["y"]))[1] - y_target) ** 2
        )
    )

path_id_to_index = {path["id"]: idx for idx, path in enumerate(data["paths"]) if "id" in path}

def normalize_xy(p):
    return {
        "x": (p["x"] - center_x) / scale,
        "y": (p["y"] - center_y) / scale
    }

for link in links:
    from_path = paths[path_id_to_index[link["from"]["pathId"]]]["points"]
    to_path = paths[path_id_to_index[link["to"]["pathId"]]]["points"]

    norm_from_a = normalize_xy(link["from"]["a"])
    norm_from_b = normalize_xy(link["from"]["b"])
    norm_to_a = normalize_xy(link["to"]["a"])
    norm_to_b = normalize_xy(link["to"]["b"])

    idx_from_a = find_nearest_point_index(from_path, norm_from_a["x"], norm_from_a["y"])
    idx_from_b = find_nearest_point_index(from_path, norm_from_b["x"], norm_from_b["y"])
    idx_to_a = find_nearest_point_index(to_path, norm_to_a["x"], norm_to_a["y"])
    idx_to_b = find_nearest_point_index(to_path, norm_to_b["x"], norm_to_b["y"])

    # Ensure stitching direction goes forward (increasing indices)
    if idx_from_a > idx_from_b:
        idx_from_a, idx_from_b = idx_from_b, idx_from_a
    if idx_to_a > idx_to_b:
        idx_to_a, idx_to_b = idx_to_b, idx_to_a

    length = min(idx_from_b - idx_from_a + 1, idx_to_b - idx_to_a + 1)

    for i in range(length):
        pt_from = from_path[idx_from_a + i]
        pt_to = to_path[idx_to_a + i]
        ax.plot(
            [pt_from["x"], pt_to["x"]],
            [pt_from["y"], pt_to["y"]],
            [pt_from["z"], pt_to["z"]],
            color="black", linestyle="-", linewidth=0.5
        )

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