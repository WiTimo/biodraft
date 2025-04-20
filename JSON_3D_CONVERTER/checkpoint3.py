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

# 2) Grab the 3rd path directly
third = data["paths"][2]
points = third["points"]
xs = np.array([pt["x"] for pt in points])
ys = np.array([pt["y"] for pt in points])

# 3) Compute cylinder radius from its flat width
x_min, x_max = xs.min(), xs.max()
circumference = x_max - x_min
radius = circumference / (2 * np.pi)

# 4) Map x→θ around the cylinder, keep y as height
thetas = 2 * np.pi * (xs - x_min) / circumference
Xc = radius * np.cos(thetas)
Yc = radius * np.sin(thetas)
Zc = ys

# 5) Identify subpath boundaries via duplicate flat points
dup_idx = np.where((np.diff(xs) == 0) & (np.diff(ys) == 0))[0] + 1
breaks = np.concatenate(([0], dup_idx, [len(xs)]))

# 6) Plot only bottom loop (large angular span & below mid-height)
mid_z = (Zc.max() + Zc.min()) / 2
fig = plt.figure(figsize=(8, 6))
ax  = fig.add_subplot(projection="3d")
for i in range(len(breaks) - 1):
    start, end = breaks[i], breaks[i+1]
    theta_span = np.ptp(thetas[start:end])
    avg_z = Zc[start:end].mean()
    if theta_span >= np.pi and avg_z < mid_z:
        ax.plot(Xc[start:end], Yc[start:end], Zc[start:end], linewidth=2, color="teal")

ax.set_title("Bottom Loop Wrapped Around Cylinder")
ax.set_xlabel("Xc (wrapped)")
ax.set_ylabel("Yc (wrapped)")
ax.set_zlabel("Original Y (height)")
ax.view_init(elev=30, azim=45)
plt.tight_layout()
plt.show()