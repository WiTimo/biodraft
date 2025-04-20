import os
import json
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

# 1) Load JSON
script_dir = os.path.dirname(os.path.abspath(__file__))
file_path  = os.path.join(script_dir, "data.json")
with open(file_path, "r") as f:
    data = json.load(f)

# 2) Grab the 3rd path directly
third = data["paths"][2]      # <-- index 2 is the third element
points = third["points"]
xs = np.array([pt["x"] for pt in points])
ys = np.array([pt["y"] for pt in points])

# identify top (sleeve cap) and bottom (hem) loops by constant Y
y_top = ys.max()
y_bot = ys.min()
eps = 1e-6
# bottom hem loop points
bot_pts = [p for p in points if abs(p["y"] - y_bot) < eps]
# sleeve cap loop points
top_pts = [p for p in points if abs(p["y"] - y_top) < eps]

# Wrap bottom loop
xs_bot = np.array([pt["x"] for pt in bot_pts])
ys_bot = np.array([pt["y"] for pt in bot_pts])
circumference_bot = xs_bot.max() - xs_bot.min()
thetas_bot = 2 * np.pi * (xs_bot - xs_bot.min()) / circumference_bot
Xc_bot = (circumference_bot / (2 * np.pi)) * np.cos(thetas_bot)
Yc_bot = (circumference_bot / (2 * np.pi)) * np.sin(thetas_bot)

# Wrap top loop
xs_top = np.array([pt["x"] for pt in top_pts])
ys_top = np.array([pt["y"] for pt in top_pts])
circumference_top = xs_top.max() - xs_top.min()
thetas_top = 2 * np.pi * (xs_top - xs_top.min()) / circumference_top
Xc_top = (circumference_top / (2 * np.pi)) * np.cos(thetas_top)
Yc_top = (circumference_top / (2 * np.pi)) * np.sin(thetas_top)

# Sort loops by theta
order_bot = np.argsort(thetas_bot)
thetas_bot, ys_bot = thetas_bot[order_bot], ys_bot[order_bot]
Xc_bot, Yc_bot = Xc_bot[order_bot], Yc_bot[order_bot]

order_top = np.argsort(thetas_top)
thetas_top, ys_top = thetas_top[order_top], ys_top[order_top]
Xc_top, Yc_top = Xc_top[order_top], Yc_top[order_top]

# 6) Build faces to fill between top & bottom loops
faces = []
n = len(Xc_bot)
for i in range(n):
    j = (i + 1) % n
    # quad between top[i]→top[j]→bot[j]→bot[i]
    faces.append([
        (Xc_top[i], Yc_top[i], ys_top[i]),
        (Xc_top[j], Yc_top[j], ys_top[j]),
        (Xc_bot[j], Yc_bot[j], ys_bot[j]),
        (Xc_bot[i], Yc_bot[i], ys_bot[i]),
    ])

# 7) Plot in 3D: loops + filled band
fig = plt.figure(figsize=(8, 6))
ax = fig.add_subplot(projection="3d")

# outline the two circles
ax.plot(Xc_top, Yc_top, ys_top, color="teal", linewidth=2)
ax.plot(Xc_bot, Yc_bot, ys_bot, color="teal", linewidth=2)

# add filled band
poly = Poly3DCollection(faces, facecolors='teal', alpha=0.5, edgecolors='none')
ax.add_collection3d(poly)

ax.set_title("Third Path Wrapped Around Cylinder")
ax.set_xlabel("Xc (wrapped)")
ax.set_ylabel("Yc (wrapped)")
ax.set_zlabel("Original Y (height)")
ax.view_init(elev=30, azim=45)
plt.tight_layout()
plt.show()