# JSON Format Reference

The exported `.json` follows Houdini's node shape specification. All coordinates are normalized: `X` runs 0 (left) to 1 (right); `Y` runs 0 (bottom) to ~0.3 (top).

```json
{
  "name": "myshape",
  "outline": [
    [0.0, 0.0],
    [1.0, 0.0],
    [1.0, 0.3],
    [0.0, 0.3]
  ],
  "inputs": [
    [0.5, 0.0, 90]
  ],
  "outputs": [
    [0.5, 0.3, 270]
  ],
  "icon": [
    [0.05, 0.05],
    [0.95, 0.25]
  ],
  "flags": {
    "0": { "outline": [[...], ...] },
    "1": { "outline": [[...], ...] }
  }
}
```

---

## Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Shape identifier used by Houdini |
| `outline` | `[[x, y], ...]` | Baked polygon vertices for the node boundary |
| `inputs` | `[[x, y, angle], ...]` | Input port positions and wire attachment angles (degrees) |
| `outputs` | `[[x, y, angle], ...]` | Output port positions and wire attachment angles (degrees) |
| `icon` | `[[x1, y1], [x2, y2]]` | Diagonal corners of the icon display region |
| `flags` | object | Named flag regions (bypass, display, lock, etc.) as polygon outlines |

---

## Wire Angles

Angles are in degrees, measured counter-clockwise from the positive X axis:

| Angle | Direction | Typical use |
|---|---|---|
| 0° | Right | — |
| 90° | Up (wires enter from below) | Inputs |
| 180° | Left | — |
| 270° | Down (wires leave upward) | Outputs |

---

## Baked Curves

Smooth spline curves are subdivided into straight-line segments during export. The **Bake Resolution** setting controls how many segments are generated per curve interval — higher values produce rounder curves at the cost of a larger file. A value of 6–10 is sufficient for most shapes.
