import os
import json
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, "data.json")

# Load your JSON data here (replace with actual file path)
with open(file_path, "r") as f:
    data = json.load(f)

paths = data.get("paths", [])
links = data.get("links", [])

# Helper functions
def get_path_points_by_id(path_id):
    for path in paths:
        if path["id"] == path_id:
            return path["points"]
    return []

def interpolate_segment(p_start, p_end, num_points=10):
    return np.linspace(p_start, p_end, num_points)

def plot_path_outline(ax, path, z_offset, color):
    xs = [p["x"] for p in path["points"]]
    ys = [p["y"] for p in path["points"]]
    zs = [z_offset] * len(xs)
    ax.plot(xs, ys, zs, color=color)

# Identify panels by size
path_data = []
for path in paths:
    xs = [p["x"] for p in path["points"]]
    ys = [p["y"] for p in path["points"]]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    area = width * height
    path_data.append({"id": path["id"], "area": area, "path": path})

sorted_paths = sorted(path_data, key=lambda x: -x["area"])
back_panel = sorted_paths[0]["path"]
front_panel = sorted_paths[1]["path"]
sleeve_1 = sorted_paths[2]["path"]
sleeve_2 = sorted_paths[3]["path"]

# Z-depths
depth_map = {
    back_panel["id"]: 0,
    front_panel["id"]: 10,
    sleeve_1["id"]: 5,
    sleeve_2["id"]: 5
}

# Extract stitch segments from links
stitch_segments = []
for link in links:
    from_path_id = link["from"]["pathId"]
    to_path_id = link["to"]["pathId"]
    a_from = link["from"]["a"]
    b_from = link["from"]["b"]
    a_to = link["to"]["a"]
    b_to = link["to"]["b"]

    seg = {
        "from": [(a_from["x"], a_from["y"], depth_map.get(from_path_id, 5)),
                 (b_from["x"], b_from["y"], depth_map.get(from_path_id, 5))],
        "to": [(a_to["x"], a_to["y"], depth_map.get(to_path_id, 5)),
               (b_to["x"], b_to["y"], depth_map.get(to_path_id, 5))],
        "from_id": from_path_id,
        "to_id": to_path_id
    }
    stitch_segments.append(seg)

# Identify sleeve-related seams
from collections import defaultdict
pairwise_links = defaultdict(list)
for seg in stitch_segments:
    pair = tuple(sorted([seg["from_id"], seg["to_id"]]))
    pairwise_links[pair].append(seg)

likely_sleeve_links = []
for pair, segments in pairwise_links.items():
    if sleeve_1["id"] in pair or sleeve_2["id"] in pair:
        likely_sleeve_links.extend(segments)

# Generate armhole rings and sleeve caps
armhole_rings = []
sleeve_caps = []
n_interp = 30

for seg in likely_sleeve_links:
    from_start, from_end = np.array(seg["from"][0]), np.array(seg["from"][1])
    to_start, to_end = np.array(seg["to"][0]), np.array(seg["to"][1])

    from_line = interpolate_segment(from_start, from_end, num_points=n_interp)
    to_line = interpolate_segment(to_start, to_end, num_points=n_interp)

    armhole_ring = np.vstack([from_line[:n_interp//2], to_line[::-1][:n_interp//2]])
    sleeve_cap = (from_line[:n_interp//2] + to_line[::-1][:n_interp//2]) / 2

    if len(armhole_ring) == len(sleeve_cap):
        armhole_rings.append(armhole_ring)
        sleeve_caps.append(sleeve_cap)

# Build wrapped sleeve tubes
sleeve_tube_faces = []
def build_sleeve_tube(sleeve_cap_points, radius=40, length=150):
    cap = np.array(sleeve_cap_points)
    tube_faces = []
    for i in range(len(cap)):
        angle = 2 * np.pi * i / len(cap)
        offset = np.array([radius * np.cos(angle), radius * np.sin(angle), -length])
        bottom = cap[i] + offset
        if i < len(cap) - 1:
            quad = [cap[i], cap[i + 1], bottom, bottom]
        else:
            quad = [cap[i], cap[0], bottom, bottom]
        tube_faces.append(quad)
    return tube_faces

for cap in sleeve_caps:
    tube = build_sleeve_tube(cap)
    sleeve_tube_faces.extend(tube)

# Plot
fig = plt.figure(figsize=(14, 10))
ax = fig.add_subplot(111, projection='3d')

# Sleeves
poly_tubes = Poly3DCollection(sleeve_tube_faces, facecolors='plum', alpha=0.8, edgecolors='k')
ax.add_collection3d(poly_tubes)

# Armhole caps
for ring, cap in zip(armhole_rings, sleeve_caps):
    for i in range(len(ring) - 1):
        quad = [ring[i], ring[i + 1], cap[i + 1], cap[i]]
        ax.add_collection3d(Poly3DCollection([quad], facecolors='lightblue', edgecolors='k', alpha=0.7))

# Pattern outlines
plot_path_outline(ax, back_panel, 0, "orange")
plot_path_outline(ax, front_panel, 10, "red")
plot_path_outline(ax, sleeve_1, 5, "purple")
plot_path_outline(ax, sleeve_2, 5, "green")

ax.set_title("Sleeves Wrapped into Cylindrical Tubes and Attached to Shirt")
ax.set_xlabel("X")
ax.set_ylabel("Y")
ax.set_zlabel("Z")
ax.view_init(elev=30, azim=-105)
ax.invert_yaxis()
plt.tight_layout()
plt.show()
