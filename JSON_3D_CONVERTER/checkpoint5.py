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

# 2) Grab both connector paths (third and fourth)
paths_to_plot = data["paths"][2:4]

# Store best loop data
best_loop = None
best_length = 0
best_coords = (None, None, None)

# 3–5) For each path, unwrap and filter loops
fig = plt.figure(figsize=(8, 6))
ax  = fig.add_subplot(projection="3d")
for p in paths_to_plot:
    points = p["points"]
    xs = np.array([pt["x"] for pt in points])
    ys = np.array([pt["y"] for pt in points])

    # Compute cylinder parameters
    x_min, x_max = xs.min(), xs.max()
    circ = x_max - x_min
    radius = circ / (2 * np.pi)
    thetas = 2 * np.pi * (xs - x_min) / circ
    Xc = radius * np.cos(thetas)
    Yc = radius * np.sin(thetas)
    Zc = ys

    # 5) Detect constant-height loops
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

# 6) Draw replacement circle
if best_loop:
    s, e = best_loop
    Xc, Yc, Zc = best_coords

    # Use center of original loop
    center_x = np.mean(Xc[s:e])
    center_y = np.mean(Yc[s:e])
    z_height = np.mean(Zc[s:e])

    # Calculate new radius for perfect circle
    radius = best_length / (2 * np.pi)

    # Create new perfect circle points
    theta = np.linspace(0, 2 * np.pi, 100)
    new_X = center_x + radius * np.cos(theta)
    new_Y = center_y + radius * np.sin(theta)
    new_Z = np.full_like(new_X, z_height)

    # Plot replacement circle
    ax.plot(new_X, new_Y, new_Z, linewidth=2, color="orange")
    print(f"Replaced old loop with perfect circle of circumference {best_length:.2f} units")

# 7) Finalize plot
ax.set_title("Wrapped Paths: Replaced with Perfect Circle")
ax.set_xlabel("Xc (wrapped)")
ax.set_ylabel("Yc (wrapped)")
ax.set_zlabel("Original Y (height)")
ax.view_init(elev=30, azim=45)
plt.tight_layout()
plt.show()