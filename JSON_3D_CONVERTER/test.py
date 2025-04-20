import os
import json
import numpy as np

script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, "data.json")
# load points
with open(file_path, 'r') as file:
    data = json.load(file)
pts = data["paths"][2]["points"]
xs = np.array([p["x"] for p in pts])
ys = np.array([p["y"] for p in pts])

# find the biggest jump in Y
dy = np.diff(ys)
idx = np.argmax(np.abs(dy))
print(f"Jump at index {idx}:  y[{idx}]={ys[idx]:.1f} → y[{idx+1}]={ys[idx+1]:.1f}")
print(f" coordinates:  ({xs[idx]:.1f},{ys[idx]:.1f}) → ({xs[idx+1]:.1f},{ys[idx+1]:.1f})")