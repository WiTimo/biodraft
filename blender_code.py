import bpy
import json
from mathutils import Vector

# === SETTINGS ===
json_path = "C:/Users/timo/Downloads/patterns_with_handles (5).json"
samples_per_segment = 20  # More = smoother Bezier curves

# === LOAD JSON ===
with open(json_path, 'r') as f:
    data = json.load(f)

pattern = data['patterns'][0]
points = pattern['points']
closed = pattern.get('closed', False)

# === FUNCTION: Evaluate cubic Bezier point ===
def cubic_bezier(p0, p1, p2, p3, t):
    return (
        (1 - t)**3 * p0 +
        3 * (1 - t)**2 * t * p1 +
        3 * (1 - t) * t**2 * p2 +
        t**3 * p3
    )

# === SAMPLE BEZIER CURVE ===
sampled_points = []

for i in range(len(points)):
    p0 = Vector((points[i]['x'], points[i]['y'], 0))
    handle_out = Vector((points[i]['handleOut']['dx'], points[i]['handleOut']['dy'], 0))
    p1 = p0 + handle_out

    if i + 1 < len(points):
        next_p = Vector((points[i+1]['x'], points[i+1]['y'], 0))
        handle_in = Vector((points[i+1]['handleIn']['dx'], points[i+1]['handleIn']['dy'], 0))
        p2 = next_p + handle_in
        p3 = next_p
    else:
        if closed:
            next_p = Vector((points[0]['x'], points[0]['y'], 0))
            handle_in = Vector((points[0]['handleIn']['dx'], points[0]['handleIn']['dy'], 0))
            p2 = next_p + handle_in
            p3 = next_p
        else:
            break

    for j in range(samples_per_segment):
        t = j / samples_per_segment
        sampled = cubic_bezier(p0, p1, p2, p3, t)
        sampled_points.append(sampled)

if closed:
    sampled_points.append(sampled_points[0])  # Close the curve

# === CREATE MESH ===
mesh_data = bpy.data.meshes.new("SimplePattern")
mesh_obj = bpy.data.objects.new("SimplePattern", mesh_data)
bpy.context.collection.objects.link(mesh_obj)

verts = sampled_points
edges = [(i, i + 1) for i in range(len(verts) - 1)]
if closed:
    edges.append((len(verts) - 1, 0))

mesh_data.from_pydata(verts, edges, [])
mesh_data.update()

# === FILL THE SHAPE ===
bpy.context.view_layer.objects.active = mesh_obj
mesh_obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.edge_face_add()  # Fill the edge loop
bpy.ops.object.mode_set(mode='OBJECT')


print("✅ Done: JSON Bezier converted into filled white mesh!")
