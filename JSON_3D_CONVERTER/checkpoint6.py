import os
import json
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D

# 1) Load JSON
script_dir = os.path.dirname(os.path.abspath(__file__))
file_path  = os.path.join(script_dir, "data.json")
with open(file_path, "r") as f:
    data = json.load(f)

fig = plt.figure(figsize=(8, 6))
ax  = fig.add_subplot(projection="3d")

# ===============================
# PART 1 — Plot bottom loop from 3rd path
# ===============================
third = data["paths"][2]
points = third["points"]
xs = np.array([pt["x"] for pt in points])
ys = np.array([pt["y"] for pt in points])

# Compute cylinder radius and unwrap
x_min, x_max = xs.min(), xs.max()
circumference = x_max - x_min
radius = circumference / (2 * np.pi)
thetas = 2 * np.pi * (xs - x_min) / circumference
Xc = radius * np.cos(thetas)
Yc = radius * np.sin(thetas)
Zc = ys

# Break into subpaths at repeated points
dup_idx = np.where((np.diff(xs) == 0) & (np.diff(ys) == 0))[0] + 1
breaks = np.concatenate(([0], dup_idx, [len(xs)]))

# Plot the bottom loop
mid_z = (Zc.max() + Zc.min()) / 2
for i in range(len(breaks) - 1):
    start, end = breaks[i], breaks[i+1]
    theta_span = np.ptp(thetas[start:end])
    avg_z = Zc[start:end].mean()
    if theta_span >= np.pi and avg_z < mid_z:
        ax.plot(Xc[start:end], Yc[start:end], Zc[start:end], linewidth=2, color="teal")

# ===============================
# PART 2 — Detect top loop, replace with perfect circle
# ===============================
paths_to_plot = data["paths"][2:4]
best_loop = None
best_length = 0
best_coords = (None, None, None)

for p in paths_to_plot:
    points = p["points"]
    xs = np.array([pt["x"] for pt in points])
    ys = np.array([pt["y"] for pt in points])

    # Unwrap
    x_min, x_max = xs.min(), xs.max()
    circ = x_max - x_min
    radius = circ / (2 * np.pi)
    thetas = 2 * np.pi * (xs - x_min) / circ
    Xc = radius * np.cos(thetas)
    Yc = radius * np.sin(thetas)
    Zc = ys

    # Find flat segments (constant height loops)
    dZ = np.abs(np.diff(Zc))
    flat = dZ < 1e-6
    loops = []
    start = None
    for idx, is_flat in enumerate(flat):
        if is_flat and start is None:
            start = idx
        elif not is_flat and start is not None:
            loops.append((start, idx+1))
            start = None
    if start is not None:
        loops.append((start, len(Zc)))

    for (s, e) in loops:
        if e - s > 50:
            dists = np.sqrt(np.diff(Xc[s:e])**2 + np.diff(Yc[s:e])**2 + np.diff(Zc[s:e])**2)
            length = np.sum(dists)
            if length > best_length:
                best_length = length
                best_loop = (s, e)
                best_coords = (Xc, Yc, Zc)

# Draw replacement perfect top circle
if best_loop:
    s, e = best_loop
    Xc, Yc, Zc = best_coords
    center_x = np.mean(Xc[s:e])
    center_y = np.mean(Yc[s:e])
    z_height = np.mean(Zc[s:e])

    radius = best_length / (2 * np.pi)
    theta = np.linspace(0, 2 * np.pi, 100)
    new_X = center_x + radius * np.cos(theta)
    new_Y = center_y + radius * np.sin(theta)
    new_Z = np.full_like(new_X, z_height)

    ax.plot(new_X, new_Y, new_Z, linewidth=2, color="orange")
    print(f"Replaced top loop with perfect circle of circumference {best_length:.2f} units")

# ===============================
# Finalize
# ===============================
ax.set_title("Bottom Loop + Replaced Top Circle")
ax.set_xlabel("Xc (wrapped)")
ax.set_ylabel("Yc (wrapped)")
ax.set_zlabel("Original Y (height)")
ax.view_init(elev=30, azim=45)
plt.tight_layout()
plt.show()