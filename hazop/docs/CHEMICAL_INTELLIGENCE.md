# CHEMICAL INTELLIGENCE

## 1. Identity resolution

`resolveChemical(input)` normalizes a name, checks a CAS checksum, and returns
`{ canonicalName, cas, casValid, synonyms[], matchKind }` where `matchKind` is
`EXACT_CAS | EXACT_NAME | SYNONYM | AMBIGUOUS | UNRESOLVED`.

CAS validation is a real check digit calculation, not a regex: for
`\d{2,7}-\d{2}-\d`, the check digit is the sum of each digit multiplied by its
position from the right, modulo 10. `64-19-7` (acetic acid) validates;
`64-19-8` does not. An invalid CAS never silently becomes a match — it is
reported so the user can correct the source document.

`AMBIGUOUS` and `UNRESOLVED` block every downstream legal threshold conclusion.

## 2. Property store and source precedence

Property keys are fixed (§7.2 of MASTER_STRUCTURE): identity, physical,
fire/explosion, dust, toxicology/exposure, reactivity, environment,
transport/GHS. Each property value is a `FieldValue` with its own status and
source.

Source priority (§7.1), implemented in `sourcePrecedence()`:

1. official manufacturer / supplier SDS
2. government or regulator database
3. recognized occupational-health database
4. recognized scientific chemical database
5. peer-reviewed literature
6. other technical source

Precedence only applies within the *same* value; it never merges different
values. Two SDSs giving flash point 196 °C and 184 °C for the same material
produce a `CONFLICT`, not an average and not "the higher one". The UI shows a
conflict card with both sources, both retrieval dates and both locators.

## 3. Process-vs-property alerts

`packages/chemical/alerts.js` runs deterministic comparisons. An alert is
emitted **only** when both sides of the comparison have a usable status. If the
flash point is `MISSING`, the result is a *data gap*, not a "no hazard".

| rule | condition | mechanism reported |
| --- | --- | --- |
| `TEMP_ABOVE_FLASH` | operating T >= flash point | flammable atmosphere in vapour space |
| `TEMP_NEAR_FLASH` | flash point - 10 K <= operating T < flash point | margin to flammable atmosphere is small |
| `TEMP_ABOVE_BOILING` | operating T >= boiling point at operating P | vaporization / overpressure |
| `TEMP_ABOVE_DECOMP` | operating T >= decomposition onset | runaway decomposition |
| `TEMP_NEAR_DECOMP` | within 25 K of decomposition onset | insufficient margin to onset |
| `VP_EXCEEDS_DESIGN` | vapour pressure at operating T > equipment design P | overpressure |
| `INCOMPATIBLE_COLOCATED` | two chemicals in one node are on each other's incompatibility list | hazardous reaction |
| `DUST_EXPLOSION_CREDIBLE` | combustible-dust evidence + powder handling in node | dust deflagration |
| `STATIC_CREDIBLE` | powder or low-conductivity liquid transfer + flammable atmosphere possible | static ignition |
| `EXOTHERM_VS_COOLING` | exothermic reaction declared + no cooling safeguard on node | loss of temperature control |
| `MOC_INCOMPATIBLE` | chemical incompatible with declared material of construction | loss of containment |

Every alert is rendered in the mandated shape:

`FACT -> SOURCE -> PROCESS CONTEXT -> HAZARD MECHANISM -> AFFECTED NODE -> REVIEW/RECOMMENDATION`

and carries `sourceRefs[]` for both the property and the process condition. An
alert is a prompt for the team, never an automatic scenario: accepting one
creates a *draft* scenario on the node with `reviewerStatus: "DRAFT"`.

## 4. What the engine will not do

* It will not estimate a flash point from boiling point.
* It will not infer a property from a structurally similar compound.
* It will not use a value whose source is `AI_INFERENCE` in any alert.
* It will not conclude "not flammable" from the absence of data.

A missing property produces a `data_gaps` record naming the property, the
node(s) whose alerts are blocked by it, and the source types that would resolve
it.
