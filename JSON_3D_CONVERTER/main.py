import json
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D   # registers the 3D projection
from pathlib import Path

# Load JSON
file_path = Path(__file__).parent / "data.json"
with open(file_path, 'r') as f:
    data = json.load(f)

# Grab the third path
third = data["paths"][2]
pts = third["points"]
xs = [p["x"] for p in pts]
ys = [p["y"] for p in pts]
zs = [0] * len(xs)   # all points lie in the z=0 plane

# Make 3D plot
fig = plt.figure(figsize=(8, 6))
ax = fig.add_subplot(projection='3d')

ax.plot(xs, ys, zs, linewidth=2)
ax.set_xlabel("X")
ax.set_ylabel("Y")
ax.set_zlabel("Z")
ax.set_title(f"3D View of Third Path (ID={third['id']})")

# Optional: tilt the camera for a better perspective
ax.view_init(elev=30, azim=45)

plt.show()