import bpy
import math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
import os

# -----------------------------
# SETTINGS
# -----------------------------
OUTPUT_DIR = r"C:\Users\timowilde\Downloads\blender_output"
FRONT_NAME = "front.png"
BACK_NAME  = "back.png"

RENDER_RES = 1080
MARGIN_PX  = 0

CAM_NAME   = "BBoxOrthoCam"
DIST       = 25.0
CLIP_START = 0.01
CLIP_END   = 1000.0

USE_EVALUATED_MESH = True

# Lighting
LIGHT_COLLECTION_NAME = "BBoxRender_Lights"
KEY_LIGHT_NAME  = "BBox_Key"
FILL_LIGHT_NAME = "BBox_Fill"
RIM_LIGHT_NAME  = "BBox_Rim"

KEY_POWER  = 50.0
FILL_POWER = 50.0
RIM_POWER  = 0.0
WORLD_STRENGTH = 0.05

# -----------------------------
# HELPERS
# -----------------------------
def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def get_active_mesh_object():
    obj = bpy.context.active_object
    if not obj or obj.type != "MESH":
        raise RuntimeError("Select the human MESH object (not armature) as the active object.")
    return obj

def ensure_camera(scene: bpy.types.Scene):
    cam_obj = bpy.data.objects.get(CAM_NAME)
    if cam_obj is None:
        cam_data = bpy.data.cameras.new(CAM_NAME)
        cam_obj = bpy.data.objects.new(CAM_NAME, cam_data)
        scene.collection.objects.link(cam_obj)

    cam = cam_obj.data
    cam.type = 'ORTHO'
    cam.clip_start = CLIP_START
    cam.clip_end = CLIP_END

    scene.camera = cam_obj
    return cam_obj

def look_at(obj_camera: bpy.types.Object, target_point: Vector):
    """
    Robustly aim camera at a world-space point.
    Blender camera looks along local -Z, with local +Y as up.
    """
    direction = (target_point - obj_camera.location)
    if direction.length < 1e-8:
        return
    rot_quat = direction.to_track_quat('-Z', 'Y')
    obj_camera.rotation_euler = rot_quat.to_euler()

def get_object_forward_world(obj: bpy.types.Object) -> Vector:
    """
    Uses object's local +Y as its 'forward' direction in world space.
    This is the most common convention for character rigs, but it’s still robust:
    it follows your object orientation rather than world axes.
    """
    fwd = obj.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
    if fwd.length < 1e-8:
        return Vector((0.0, 1.0, 0.0))
    return fwd.normalized()

def position_camera_front(cam_obj: bpy.types.Object, obj: bpy.types.Object, target_loc: Vector):
    fwd = get_object_forward_world(obj)
    cam_obj.location = target_loc - fwd * DIST
    look_at(cam_obj, target_loc)

def position_camera_back(cam_obj: bpy.types.Object, obj: bpy.types.Object, target_loc: Vector):
    fwd = get_object_forward_world(obj)
    cam_obj.location = target_loc + fwd * DIST
    look_at(cam_obj, target_loc)

def get_world_vertices(obj: bpy.types.Object):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    if USE_EVALUATED_MESH:
        obj_eval = obj.evaluated_get(depsgraph)
        mesh = obj_eval.to_mesh()
        verts = [obj_eval.matrix_world @ v.co for v in mesh.vertices]
        obj_eval.to_mesh_clear()
        return verts
    else:
        return [obj.matrix_world @ v.co for v in obj.data.vertices]

def get_world_bounds(obj: bpy.types.Object):
    verts = get_world_vertices(obj)
    xs = [v.x for v in verts]
    ys = [v.y for v in verts]
    zs = [v.z for v in verts]
    min_v = Vector((min(xs), min(ys), min(zs)))
    max_v = Vector((max(xs), max(ys), max(zs)))
    size = max_v - min_v
    center = (min_v + max_v) * 0.5
    return center, size

def bbox_2d_in_camera(scene: bpy.types.Scene, cam_obj: bpy.types.Object, verts_world):
    xs = []
    ys = []
    for v in verts_world:
        co_ndc = world_to_camera_view(scene, cam_obj, v)
        xs.append(co_ndc.x)
        ys.append(co_ndc.y)

    min_x = min(xs); max_x = max(xs)
    min_y = min(ys); max_y = max(ys)

    res_x = scene.render.resolution_x
    res_y = scene.render.resolution_y
    mx = MARGIN_PX / res_x
    my = MARGIN_PX / res_y

    min_x -= mx; max_x += mx
    min_y -= my; max_y += my

    min_x = max(0.0, min_x); min_y = max(0.0, min_y)
    max_x = min(1.0, max_x); max_y = min(1.0, max_y)

    if max_x <= min_x or max_y <= min_y:
        raise RuntimeError("Computed an invalid 2D bbox; is the object visible to the camera?")
    return (min_x, min_y, max_x, max_y)

def set_render_border(scene: bpy.types.Scene, border):
    min_x, min_y, max_x, max_y = border
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x = min_x
    scene.render.border_min_y = min_y
    scene.render.border_max_x = max_x
    scene.render.border_max_y = max_y

def render_to(scene: bpy.types.Scene, filepath: str):
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)

def set_ortho_scale_fit_object(scene: bpy.types.Scene, cam_obj: bpy.types.Object, obj: bpy.types.Object):
    verts_world = get_world_vertices(obj)
    cam_inv = cam_obj.matrix_world.inverted()
    verts_cam = [cam_inv @ v for v in verts_world]

    xs = [v.x for v in verts_cam]
    ys = [v.y for v in verts_cam]
    width  = max(xs) - min(xs)
    height = max(ys) - min(ys)

    aspect = scene.render.resolution_x / scene.render.resolution_y
    cam_obj.data.ortho_scale = max(height, width / aspect)

def ensure_collection(name: str):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col

def ensure_area_light(name: str, collection: bpy.types.Collection):
    light_obj = bpy.data.objects.get(name)
    if light_obj is None:
        light_data = bpy.data.lights.new(name=name, type='AREA')
        light_obj = bpy.data.objects.new(name=name, object_data=light_data)
        collection.objects.link(light_obj)
    return light_obj

def aim_at(light_obj: bpy.types.Object, target: bpy.types.Object):
    for c in [c for c in light_obj.constraints if c.type == 'TRACK_TO']:
        light_obj.constraints.remove(c)

    con = light_obj.constraints.new(type='TRACK_TO')
    con.target = target
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'

def ensure_world(scene: bpy.types.Scene):
    if scene.world is None:
        scene.world = bpy.data.worlds.new("BBoxWorld")
    world = scene.world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get("Background")
    if bg:
        bg.inputs[1].default_value = WORLD_STRENGTH
        bg.inputs[0].default_value = (0.03, 0.03, 0.03, 1.0)
    return world

def ensure_lighting(scene: bpy.types.Scene, cam_obj: bpy.types.Object, obj: bpy.types.Object):
    ensure_world(scene)
    col = ensure_collection(LIGHT_COLLECTION_NAME)

    target_name = "BBox_LightTarget"
    target = bpy.data.objects.get(target_name)
    if target is None:
        target = bpy.data.objects.new(target_name, None)
        col.objects.link(target)

    center, size = get_world_bounds(obj)
    target.location = center

    max_dim = max(size.x, size.y, size.z)
    d = max(2.0, max_dim * 1.25)
    h = max_dim * 0.35
    s = max_dim * 0.60

    cam_m = cam_obj.matrix_world.to_3x3()
    cam_right = cam_m @ Vector((1, 0, 0))
    cam_up    = cam_m @ Vector((0, 1, 0))
    cam_fwd   = cam_m @ Vector((0, 0, -1))

    key = ensure_area_light(KEY_LIGHT_NAME, col)
    key.data.shape = 'RECTANGLE'
    key.data.size = max_dim * 1.2
    key.data.size_y = max_dim * 0.8
    key.data.energy = KEY_POWER
    key.location = center + cam_fwd * d + cam_right * s + cam_up * h
    aim_at(key, target)

    fill = ensure_area_light(FILL_LIGHT_NAME, col)
    fill.data.shape = 'RECTANGLE'
    fill.data.size = max_dim * 1.4
    fill.data.size_y = max_dim * 1.0
    fill.data.energy = FILL_POWER
    fill.location = center + cam_fwd * (d * 0.9) - cam_right * (s * 0.9) + cam_up * (h * 0.6)
    aim_at(fill, target)

    rim = ensure_area_light(RIM_LIGHT_NAME, col)
    rim.data.shape = 'RECTANGLE'
    rim.data.size = max_dim * 1.1
    rim.data.size_y = max_dim * 0.7
    rim.data.energy = RIM_POWER
    rim.location = center - cam_fwd * (d * 0.9) + cam_up * (h * 0.8)
    aim_at(rim, target)

# -----------------------------
# MAIN
# -----------------------------
def main():
    scene = bpy.context.scene
    obj = get_active_mesh_object()

    ensure_dir(OUTPUT_DIR)

    # Render settings
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 64

    scene.render.resolution_x = RENDER_RES
    scene.render.resolution_y = RENDER_RES
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False

    # Camera setup
    cam_obj = ensure_camera(scene)

    # Use bounds center as target
    center, _ = get_world_bounds(obj)

    # FRONT: place camera in front and aim at center
    position_camera_front(cam_obj, obj, center)
    bpy.context.view_layer.update()

    # Fit ortho scale for FRONT (same scale will be used for BACK)
    set_ortho_scale_fit_object(scene, cam_obj, obj)

    # Lighting
    ensure_lighting(scene, cam_obj, obj)

    # FRONT bbox
    verts_front = get_world_vertices(obj)
    bbox_front = bbox_2d_in_camera(scene, cam_obj, verts_front)

    # BACK: move camera behind and aim at center
    position_camera_back(cam_obj, obj, center)
    bpy.context.view_layer.update()

    # BACK bbox (same object pose; only camera moved)
    verts_back = get_world_vertices(obj)
    bbox_back = bbox_2d_in_camera(scene, cam_obj, verts_back)

    # Union crop
    union_bbox = (
        min(bbox_front[0], bbox_back[0]),
        min(bbox_front[1], bbox_back[1]),
        max(bbox_front[2], bbox_back[2]),
        max(bbox_front[3], bbox_back[3]),
    )

    # Render FRONT
    position_camera_front(cam_obj, obj, center)
    bpy.context.view_layer.update()
    set_render_border(scene, union_bbox)
    render_to(scene, os.path.join(OUTPUT_DIR, FRONT_NAME))

    # Render BACK
    position_camera_back(cam_obj, obj, center)
    bpy.context.view_layer.update()
    set_render_border(scene, union_bbox)
    render_to(scene, os.path.join(OUTPUT_DIR, BACK_NAME))

    # Restore state
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    bpy.context.view_layer.update()

    print("Done.")
    print("Output folder:", OUTPUT_DIR)
    print("Front bbox:", bbox_front)
    print("Back  bbox:", bbox_back)
    print("Union bbox:", union_bbox)

main()
