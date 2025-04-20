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

    # 5) Detect and plot constant-height loops via flat Z runs
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
        # require a minimum run length to filter out noise/spikes
        if e - s > 50:
            ax.plot(Xc[s:e], Yc[s:e], Zc[s:e], linewidth=2, color="teal")

# 6) Finalize plot
ax.set_title("Wrapped Paths: Two Circles")
ax.set_xlabel("Xc (wrapped)")
ax.set_ylabel("Yc (wrapped)")
ax.set_zlabel("Original Y (height)")
ax.view_init(elev=30, azim=45)
plt.tight_layout()
plt.show()