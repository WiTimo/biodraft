import os
import json
import matplotlib.pyplot as plt

script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, "data.json")

with open(file_path, 'r') as file:
    data = json.load(file)

# Set up the plot
plt.figure(figsize=(10, 10))
ax = plt.gca()

# Plot each path
for path in data.get('paths', []):
    points = path['points']
    x = [point['x'] for point in points]
    y = [point['y'] for point in points]
    ax.plot(x, y, label=f"Path {path['id'][:4]}...", linewidth=1)

# If there's a 'links' or 'connections' section, you could draw lines or arrows here.
# Example (uncomment if your data contains links):
# for link in data.get('links', []):
#     src = link['source']
#     tgt = link['target']
#     # Fetch source and target path endpoints
#     src_path = next(p for p in data['paths'] if p['id'] == src)
#     tgt_path = next(p for p in data['paths'] if p['id'] == tgt)
#     src_end = src_path['points'][-1]
#     tgt_start = tgt_path['points'][0]
#     ax.plot([src_end['x'], tgt_start['x']], [src_end['y'], tgt_start['y']], 'k--', alpha=0.5)

plt.title('Visualized Paths')
plt.xlabel('X Coordinate')
plt.ylabel('Y Coordinate')
plt.legend()
plt.grid(True)
plt.gca().invert_yaxis()  # Optional: invert Y if it's top-down coordinate system
plt.show()