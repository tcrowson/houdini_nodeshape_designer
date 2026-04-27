# Using the Designer

## Canvas & Navigation

The canvas uses a normalized coordinate system matching Houdini's node shape spec: `(0, 0)` is the bottom-left corner of the node and `(1, 0.3)` is the top-right. The dashed bounding box on the canvas marks this boundary.

<!-- TODO: screenshot of canvas with bounding box visible -->

| Action | How |
|---|---|
| Pan | Middle-mouse drag |
| Zoom | Mouse wheel |
| Fit view | **F** key |

---

## Tools

<!-- TODO: screenshot of toolbar with tools highlighted -->

| Key | Tool | Description |
|---|---|---|
| **V** | Select / Move | Click to select points; drag to move; Shift+click to multi-select |
| **A** | Add Point | Click on a curve segment to insert a new point |
| **D** | Delete | Click a point to remove it |
| **R** | Rectangle | Click and drag; hold Shift for a square |
| **T** | Triangle | Click and drag to place a triangle |
| **E** | Ellipse | Click and drag; hold Shift for a circle |
| — | Capsule | Click and drag to draw a rounded rectangle |
| **S** | Smooth | Convert selected points to smooth (curved) |
| **C** | Corner | Convert selected points to sharp corners |

---

## Editing Curves

Select a single smooth point to reveal its **tangent handles**:

<!-- TODO: screenshot showing a smooth point with orange/red tangent handles -->

- **Orange handle** — controls the outgoing curve direction
- **Red handle** — controls the incoming curve direction
- Drag a handle to reshape the curve
- **Ctrl+drag** a handle to break symmetry (adjust one side independently)
- **Alt+drag** a handle to restore symmetry

---

## Transform Gizmo

Select two or more points to activate the transform gizmo:

<!-- TODO: screenshot showing the bounding box gizmo with handles -->

- Drag **corner handles** to scale; hold **Shift** for uniform scale; hold **Ctrl+Shift** to scale around the centroid
- Drag the **rotation handle** (above the top-center) to rotate; hold **Shift** to snap to 15° increments
- Drag the **centroid handle** (orange circle in the center) to translate the entire selection

---

## Layers

The left panel lists all layers in the shape:

<!-- TODO: screenshot of the layers panel -->

| Layer | Purpose |
|---|---|
| **outline** | The main visible boundary of the node |
| **inputs** | Input port positions and connection angles |
| **outputs** | Output port positions and connection angles |
| **icon** | Two corner points defining the icon bounding box |
| **flag regions** | Custom areas for bypass, display, lock, and other UI indicators |

Click a layer to make it active for editing. Use the **eye icon** to toggle visibility. Add new flag regions with the **+ Add Flag Region** button at the bottom of the panel.

---

## Ports (Inputs & Outputs)

Select the **inputs** or **outputs** layer and add points to place ports. Each port point has an **angle handle** — drag it to set the connection direction (the angle at which wires attach). The default is 90° for inputs (wires enter from below) and 270° for outputs (wires leave upward).

<!-- TODO: screenshot showing a port point with its angle handle -->

---

## Grid Snapping

Press **G** to toggle grid snapping on/off. Use the **snap increment dropdown** in the toolbar to change the grid resolution (0.005 – 0.100). Grid dots appear on the canvas when snapping is active and you are zoomed in enough to see them.

---

## Background Snap

Press **Alt+G** (or click the background snap button in the toolbar) to toggle background snap on/off. When active, dragging a point will snap it to the nearest vertex on any visible layer. Useful for aligning flag region corners precisely to outline vertices.

---

## Presets

Click the **grid icon** in the toolbar to open the preset library. Click any thumbnail to load that shape as a starting point.

<!-- TODO: screenshot of the preset library grid -->

> **Note:** Loading a preset replaces the current shape. A confirmation prompt will ask before proceeding. Use undo (Ctrl+Z) to go back.

---

## Exporting Your Shape

<!-- TODO: screenshot of the right panel showing the JSON output section -->

1. **Name your shape** using the text field in the toolbar. This becomes the filename and the identifier Houdini uses.
2. Adjust **Bake Resolution** in the right panel (4–64). Higher values produce smoother curves at the cost of a larger file. A value of 6–10 is usually sufficient.
3. Click **Download** (↓ button) to save the `.json` file, or click **Copy** to copy the JSON to your clipboard.
