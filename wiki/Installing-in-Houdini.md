# Installing in Houdini

## Step 1 — Locate the NodeShapes directory

Place your `.json` file in Houdini's node shapes directory. The user preferences path is:

| Platform | Path |
|---|---|
| **Linux / macOS** | `~/houdiniX.Y/config/NodeShapes/` |
| **Windows** | `C:\Users\<username>\Documents\houdiniX.Y\config\NodeShapes\` |

Replace `X.Y` with your Houdini version (e.g., `houdini20.5`). Create the `NodeShapes` folder if it doesn't exist.

> You can also place the file in any directory on your `HOUDINI_PATH` under `config/NodeShapes/`, which is useful for sharing shapes across a studio via a network location.

---

## Step 2 — Restart Houdini

Houdini loads node shape files at startup. Restart Houdini (or reload the node shape registry) for the new shape to become available.

---

## Step 3 — Assign the shape to a node or HDA

**For an HDA:**

<!-- TODO: screenshot of the Type Properties Node tab with Node Shape field -->

1. Open the **Type Properties** dialog for your HDA (right-click the node → Type Properties)
2. Go to the **Node** tab
3. Set **Node Shape** to the name of your shape (the filename without `.json`)
4. Click **Accept**

**For a network-level default** (all nodes of a given type):
- Use `hou.NodeType.setDefaultShape()` in Python, or set the shape directly in an HDA's node type properties.

---

## Verifying the Installation

In Houdini's **Network Editor**, right-click any node → **Flags** → **Change Node Shape** — your custom shape should appear in the list.

<!-- TODO: screenshot of the Change Node Shape menu in Houdini -->
