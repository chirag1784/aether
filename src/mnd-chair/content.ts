export interface PartInfo {
  id: string
  name: string
  material: string
  size: string
  bomGroup: string
}

export const PARTS: Record<string, PartInfo> = {
  base: { id: 'base', name: 'Base frame', material: 'MS square tube 32×32×2.6mm, fully welded', size: '0.9m × 0.6m footprint', bomGroup: 'base' },
  casters: { id: 'casters', name: 'Locking casters', material: 'Total-lock swivel caster (wheel + swivel)', size: '100mm wheel, ×4', bomGroup: 'base' },
  mast: { id: 'mast', name: 'Pivot mast', material: 'MS square tube 32×32×2.6mm, welded to base', size: '~10cm stub — pivot sits low, near the base', bomGroup: 'base' },
  leg: { id: 'leg', name: 'Leg board (shin support)', material: 'Plywood/HDPE backing + foam + vinyl', size: '~0.55m × 0.55m', bomGroup: 'board' },
  torso: { id: 'torso', name: 'Torso board (thigh + back + head)', material: 'Plywood/HDPE backing + foam + vinyl', size: '~1.15m × 0.55m', bomGroup: 'board' },
  strut: { id: 'strut', name: 'Worm-gear hand-crank jack', material: 'ACME threaded rod + worm-gear box, self-locking', size: '~0.5m stroke, rated ≥1.5× patient body weight', bomGroup: 'mechanism' },
  lock: { id: 'lock', name: 'Hand crank handle', material: 'Steel crank arm + knob, folds flat when stowed', size: 'Turns the worm-gear jack', bomGroup: 'mechanism' },
  headwings: { id: 'headwings', name: 'Head wing pads', material: 'Firm foam + vinyl, adjustable bracket', size: '2 × 0.14m pads', bomGroup: 'padding' },
  tray: { id: 'tray', name: 'Tray table', material: '12mm plywood/HDPE laminate, folding arms', size: '0.5m × 0.35m', bomGroup: 'padding' },
  straps: { id: 'straps', name: 'Support straps', material: 'Padded webbing, quick-release buckles', size: 'Chest / pelvis / knee / ankle', bomGroup: 'straps' },
  footplate: { id: 'footplate', name: 'Footplate', material: 'MS flat bar + non-slip pad', size: '0.3m × 0.22m', bomGroup: 'board' },
}

export interface Citation {
  label: string
  url: string
}

export interface ResearchFinding {
  title: string
  points: string[]
  citations: Citation[]
}

export const researchFindings: ResearchFinding[] = [
  {
    title: 'Why full-body passive support, not a gait trainer',
    points: [
      'For a person who cannot actively move any part of the body, seating literature is consistent that postural control must come from the equipment, not from the patient — arms, trunk and head all need external support rather than a frame that assumes some voluntary bracing.',
      'This is the basis for choosing a hinged recline-to-stand board (tilt-table pattern) over a walker-style gait trainer: the board carries 100% of the body weight through straps and padding at every stage of the movement, with no assumption of grip strength, arm push, or trunk control.',
    ],
    citations: [
      { label: 'OT Practice — Seating & postural management', url: 'https://www.theotpractice.co.uk/how-we-help/specialisms/seating-and-postural-management' },
      { label: 'MND Association — Occupational therapy for MND', url: 'https://www.mndassociation.org/sites/default/files/2022-11/Occupational%20therapy%20for%20MND.pdf' },
    ],
  },
  {
    title: 'Tilt-in-space over simple recline',
    points: [
      'Tilt-in-space keeps the seat-to-back angle constant while the whole seating system rotates backward — this redistributes weight across the body rather than sliding it toward the sacrum, which is why it is the primary recommendation for MND seating over back-angle recline alone.',
      'For neuromuscular weakness specifically, tilting gives neck muscles a break from holding the head up against gravity, and reduces the energy the body needs to spend fighting gravity to stay upright — directly relevant given zero voluntary movement.',
      'The chair in this build achieves the same effect structurally: the whole board (seat-to-head) rotates together about the hip pivot, so the body\'s position relative to the board never changes — equivalent in principle to a tilt-in-space wheelchair.',
    ],
    citations: [
      { label: 'Seating Matters — Considerations when seating a client with MND', url: 'https://seatingmatters.com/gb-ie/learn/blog/considerations-when-seating-a-client-with-mnd' },
      { label: 'Vivid Care — Best chairs for people with MND', url: 'https://www.vivid.care/insights/advice-tips/the-best-chairs-for-people-with-motor-neuron-disease-mnd/' },
      { label: 'WheelFreedom — 24-hour posture management', url: 'https://www.wheelfreedom.com/24-hour-posture-management' },
    ],
  },
  {
    title: 'Standing frame benefits and precautions',
    points: [
      'Regular supported standing is associated with improved circulation, maintained joint range of motion, reduced risk of pressure ulcers and urinary tract infections, and better bone density — independent of any voluntary muscle activity from the patient.',
      'The main clinical risk is orthostatic hypotension — a drop of ≥20 mmHg systolic or ≥10 mmHg diastolic within 3 minutes of standing. This is why standing must be brought up gradually in small angle increments with a pause to check colour and breathing at each step, exactly as specified in §8 of this guide, and why the mechanism must hold any intermediate angle indefinitely, not just fully reclined or fully upright.',
      'Clinical tilt-table protocols bring patients upright over 20–45 minutes for testing; a home standing session does not need to be that slow, but the principle — gradual, monitored, reversible at any point — is the same one this chair\'s mechanism is built around.',
    ],
    citations: [
      { label: 'Washington HCA — Standing frames effectiveness & safety rapid review', url: 'https://www.hca.wa.gov/assets/program/rapid-review-standing-frames.pdf' },
      { label: 'AAFP — Orthostatic hypotension: a practical approach', url: 'https://www.aafp.org/pubs/afp/issues/2022/0100/p39.html' },
      { label: 'StatPearls — Tilt table testing', url: 'https://www.ncbi.nlm.nih.gov/books/NBK482320/' },
    ],
  },
  {
    title: 'Pressure care and cushioning',
    points: [
      'When seated, the majority of body weight passes through the ischial tuberosities, sacrum and greater trochanters — the three most common sites for pressure injury, together accounting for roughly 70% of seated pressure ulcers.',
      'Guidance calls for high-specification pressure-redistributing foam, positioning that keeps weight on the posterior thighs rather than the sacrum (avoiding a posterior pelvic tilt/slouch), and limiting continuous seated time — commonly cited as 2 hours or less for an at-risk person, shorter again if any skin breakdown already exists.',
      'This directly informs the cushioning spec in §6: high-density base foam plus a pressure-relief topper under the pelvis/sacrum area specifically, and the tilt-in-space motion itself functions as a scheduled pressure-relief repositioning tool through the day.',
    ],
    citations: [
      { label: 'Wales Best Practice — Seating and pressure ulcers', url: 'https://www.wwic.wales/uploads/files/files/All%20Wales-Seating%20and%20PUs_FINAL(1).pdf' },
      { label: 'AliMed — Positioning to prevent pressure ulcers', url: 'https://www.alimed.com/blogs/patient-positioning/positioning-to-prevent-pressure-ulcers' },
    ],
  },
  {
    title: 'Head, arm and footrest specifics for MND',
    points: [
      'A single continuous leg/footrest (rather than two independent footplates) is the recommended footrest pattern as leg strength and coordination decline, since it removes the need to independently position two separate rests.',
      'Armrests are described as important beyond comfort: they stop the arms from crossing or the trunk from hunching forward, a posture that can restrict breathing — relevant given respiratory muscles are also affected in MND.',
      'Head and neck support should be adjustable in both height and tilt as head control changes, and lateral (side-to-side) support matters as much as front-to-back support once head control is significantly reduced — the basis for the wing-pad headrest in §4.',
    ],
    citations: [
      { label: 'Vivid Care — Best chairs for people with MND', url: 'https://www.vivid.care/insights/advice-tips/the-best-chairs-for-people-with-motor-neuron-disease-mnd/' },
      { label: 'MND Association — Head supports for Motor Neurone Disease', url: 'https://www.mndassociation.org/sites/default/files/public/2023-08/P1%20Head%20Supports%202022.pdf' },
    ],
  },
]

export interface BomItem {
  part: string
  spec: string
  qty: string
  group: 'base' | 'board' | 'mechanism' | 'padding' | 'straps' | 'hardware'
}

export const bom: BomItem[] = [
  { part: 'Mild steel square tube', spec: '32×32×2.6 mm — base frame & board sub-frames (load-bearing)', qty: '~20 m', group: 'base' },
  { part: 'Mild steel flat bar', spec: '25×5 mm — pivot brackets, jack mounts, knee-hinge plates', qty: '~3 m' , group: 'base'},
  { part: 'Locking swivel casters', spec: '100 mm wheel, ≥75 kg rated each, total-lock (wheel + swivel)', qty: '4', group: 'base' },
  { part: 'Rust primer + enamel paint', spec: 'Metal primer + top coat, full frame', qty: '1 set', group: 'base' },
  { part: 'Pivot bolt assembly', spec: 'Grade 8.8, 14 mm, flanged bronze bushings, grease nipple', qty: '1', group: 'mechanism' },
  { part: 'Knee-break hinge', spec: 'Heavy-duty piano hinge or flat-bar pin hinge, full board width', qty: '1', group: 'mechanism' },
  { part: 'Worm-gear hand-crank jack', spec: 'ACME/trapezoidal threaded rod through a worm-gear box, self-locking — cannot be back-driven by body weight, holds any angle with the crank released, rated ≥1.5× patient body weight', qty: '1', group: 'mechanism' },
  { part: 'Hand crank handle', spec: 'Folds flat against the mast when not in use, turns the worm-gear jack', qty: '1', group: 'mechanism' },
  { part: 'Marine plywood or 6 mm HDPE backing board', spec: 'Rigid backing under padding — torso board ~110×55 cm, leg board ~65×55 cm', qty: '2 panels', group: 'board' },
  { part: 'High-density base foam', spec: '50 mm, full board area', qty: '2 panels', group: 'padding' },
  { part: 'Pressure-relief foam topper', spec: '25–40 mm, positioned under pelvis/sacrum zone specifically', qty: '1 panel', group: 'padding' },
  { part: 'Wipeable vinyl/rexine upholstery', spec: 'Waterproof, stitched covers over foam', qty: '~4 m', group: 'padding' },
  { part: 'Head wing pads', spec: 'Firm foam + vinyl, adjustable steel bracket, height + lateral adjust', qty: '1 pair', group: 'padding' },
  { part: 'Tray table', spec: '12 mm plywood/HDPE laminate on folding steel swing arms', qty: '1', group: 'padding' },
  { part: 'Chest / trunk strap', spec: 'Padded H or X-strap, quick-release buckle', qty: '1', group: 'straps' },
  { part: 'Pelvic strap', spec: 'Padded, quick-release buckle', qty: '1', group: 'straps' },
  { part: 'Knee strap', spec: 'Padded, over the leg board at the knee', qty: '1', group: 'straps' },
  { part: 'Ankle / foot straps', spec: 'Padded, at the footplate', qty: '2', group: 'straps' },
  { part: 'Grade 8.8 bolts, locknuts, washers', spec: 'Assorted M8–M14', qty: '1 set', group: 'hardware' },
]

export interface DimensionRow {
  measurement: string
  how: string
  typical: string
}

export const dimensions: DimensionRow[] = [
  { measurement: 'Torso board length (hip to head)', how: 'Floor-lying: hip crease to top of head + 10 cm headroom', typical: '95–115 cm' },
  { measurement: 'Leg board length (knee to heel)', how: 'Knee crease to sole of foot', typical: '55–70 cm' },
  { measurement: 'Board width', how: 'Widest point across shoulders/hips + 8–10 cm clearance', typical: '55–65 cm' },
  { measurement: 'Base footprint (min.)', how: 'Board width + 20 cm clearance on every side — wider is safer', typical: '85–100 cm' },
  { measurement: 'Chest strap height (standing)', how: 'Floor to mid-sternum, standing supported', typical: '115–130 cm' },
  { measurement: 'Head wing height', how: 'Floor to ear level, adjustable ±8 cm', typical: '145–165 cm' },
  { measurement: 'Tray table height', how: 'Floor to elbow, seated at ~90°, adjustable', typical: '70–85 cm' },
  { measurement: 'Knee-break hinge position', how: 'Measured from the base pivot, along the leg (shin) board, to the knee crease', typical: '45–55 cm' },
]

export interface StructuralNote {
  element: string
  detail: string
}

export const structuralNotes: StructuralNote[] = [
  { element: 'Base frame', detail: 'Rectangular MS tube perimeter, fully welded corners (no bolted base joints — this is the one sub-assembly that should not be a disassembly point). Cross-braced diagonally under the pivot mast for torsional stiffness.' },
  { element: 'Pivot mast & hip pivot', detail: 'Twin flat-bar plates either side of the board sub-frame, sandwiching a single through-bolt on bronze-bushed bearings. This is the highest-load joint in the structure and the one most worth over-building.' },
  { element: 'Knee-break hinge', detail: 'Full-width hinge (not a single point) spreads bending load across the board rather than concentrating it — a piano hinge the width of the board, or 3 evenly spaced pin hinges, both work.' },
  { element: 'Worm-gear jack mounting', detail: 'Lower bracket welded to the base mast; upper bracket bolted (not welded) to the underside of the torso board sub-frame — this bolt is also a disassembly point. The worm-gear mesh is self-locking by design — it cannot be back-driven by the patient\'s weight, so the crank holds any angle the moment the caregiver stops turning it, with no separate pin needed.' },
  { element: 'Hand crank', detail: 'Folds flat against the mast when not in use so it doesn\'t catch on anything during transfers; turning it winds the threaded rod through the worm-gear box to tilt the board.' },
  { element: 'Tray & head-wing brackets', detail: 'Bolted, not welded, onto the torso board sub-frame — both are also disassembly points and are the lightest-load joints, so standard M8 bolts are adequate.' },
]

export interface Step {
  title: string
  body: string
}

export const disassembleSteps: Step[] = [
  { title: 'Crank to the flat/lying position and empty the board', body: 'Wind the hand crank to the fully flat angle and transfer the patient off first, following your normal routine, before any tools come out.' },
  { title: 'Mark every bolt hole with a paint pen', body: 'Pivot bolt, jack bracket, knee hinge (if bolted), head-wing brackets, tray brackets. This guarantees reassembly always lands in the same holes, keeping the fit calibrated to the patient.' },
  { title: 'Remove the tray table and head wings', body: 'Both are bolted sub-assemblies — unbolt and set aside first, they are the lightest pieces.' },
  { title: 'Disconnect the worm-gear jack\'s upper bracket', body: 'Unbolt where the jack meets the torso board. The jack, crank, and its lower bracket stay with the base.' },
  { title: 'Support the board, then remove the pivot bolt', body: 'With one person holding the board steady, withdraw the pivot bolt. The full board assembly (torso + leg board, still hinged together at the knee) lifts off the base as one piece.' },
  { title: 'Four to six pieces, ready to move', body: 'Base + mast + casters (heaviest, two people), the board assembly, the head wings, and the tray table.' },
]

export const reassembleSteps: Step[] = [
  { title: 'Base first', body: 'Set the base + mast down, casters unlocked, on level ground.' },
  { title: 'Refit the board at the pivot', body: 'Line up the paint marks, drop the pivot bolt through, torque to snug + a quarter turn, fit the locknut.' },
  { title: 'Reconnect the worm-gear jack bracket', body: 'Same paint-marked hole. Crank it once through a small range by hand to confirm free, smooth movement before loading it.' },
  { title: 'Rebolt the head wings and tray table', body: 'Both to their marked positions.' },
  { title: 'Re-run the full load test', body: 'Every time — after any reassembly, repeat the sandbag load test from §8 before the patient is placed in it again. A refit is a new build, safety-wise.' },
]

export const safetyChecklist: string[] = [
  'All four casters locked before any transfer or angle change',
  'Chest, pelvic, knee and ankle straps fastened and checked snug — but not restrictive',
  'Hand crank released fully at the target angle and confirmed to hold with no creep before letting go of the board',
  'No one leaves the patient unattended while reclined above the flat position',
  'Angle changes made in small increments with a pause to check colour and breathing at each step (orthostatic hypotension precaution)',
  'Seated/reclined duration limited to about 2 hours before a position change or pressure-relief break',
]
