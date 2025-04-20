import json
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from pathlib import Path

# 1) Load the JSON data
file_path = Path(__file__).parent / "data.json"
with open(file_path, "r") as f:
    data = json.load(f)

# 2) Extract only the third object (index 2)
third = data["paths"][2]
xs = np.array([pt["x"] for pt in third["points"]])
ys = np.array([pt["y"] for pt in third["points"]])

# 3) Compute cylinder parameters from its width
x_min, x_max = xs.min(), xs.max()
circumference = x_max - x_min
radius = circumference / (2 * np.pi)

# 4) Map flat (x,y) → 3D (θ, radius, y)
thetas = 2 * np.pi * (xs - x_min) / circumference
Xc = radius * np.cos(thetas)
Yc = radius * np.sin(thetas)
Zc = ys  # keep original Y as vertical height

# 5) Plot the wrapped curve
fig = plt.figure(figsize=(8, 6))
ax  = fig.add_subplot(projection="3d")
ax.plot(Xc, Yc, Zc, linewidth=2, color="teal")

ax.set_title("Third Object Wrapped Around Cylinder")
ax.set_xlabel("Xc (wrapped)")
ax.set_ylabel("Yc (wrapped)")
ax.set_zlabel("Original Y (height)")
ax.view_init(elev=30, azim=45)
plt.tight_layout()
plt.show()