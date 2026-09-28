# Cell inspector

- **Author:** zpro4231 (Meshy community).
- **Source:** https://www.meshy.ai/3d-models/Construction-Worker-Character-v2-0197f0cd-c0f9-7373-806c-bea76b7fe8b7
- **Original title:** Construction Worker Character.
- **License:** CC0, as stated on the public model page (accessed 2026-09-25).
- **License text:** https://creativecommons.org/publicdomain/zero/1.0/
- **Generation:** Meshy 5 Preview. The model is AI-generated, not a scan of an identified person.

The bundled `inspector.glb` is an optimized derivative of the publicly provided
`Animation_Walking_withSkin.glb`. It is a separate character from the forklift
driver in `../workshop/worker.glb`.

Geometry was simplified with glTF Transform 4.4.0 (`simplify --ratio 0.2
--error 0.001`) to 34,457 triangles. The unused walking animation and unused
accessors were removed. The source's self-illuminated material and excessive
specular extension were replaced with nonmetallic, rough PBR materials.
The original embedded 2048 x 2048 texture and 24-joint skeleton are retained.

The hard hat uses a separate material with an orange tint while retaining the
source texture. Its triangles were selected by their upper-head position and
yellow texture samples; skin and workwear retain their original material.
The two material primitives share the source skeleton and vertex attributes.

The source mesh is Y-up, faces +Z, and is 1.70 m tall including the hard hat.
The scene scales it to 1.75 m and applies the drawing-holding pose and gaze
animation at runtime. The application loads the model locally without remote
asset requests.
