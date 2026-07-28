import { useState } from 'react'
import Scene, { type ViewState } from './Scene'
import {
  researchFindings,
  bom,
  dimensions,
  structuralNotes,
  disassembleSteps,
  reassembleSteps,
  safetyChecklist,
  PARTS,
  type BomItem,
} from './content'

const STATE_LABELS: { key: ViewState; label: string }[] = [
  { key: 'lying', label: 'Lying (transfer)' },
  { key: 'sit', label: 'Reclined sitting' },
  { key: 'stand', label: 'Standing' },
  { key: 'exploded', label: 'Exploded' },
]

const GROUP_LABEL: Record<BomItem['group'], string> = {
  base: 'Base & mobility',
  board: 'Board assembly',
  mechanism: 'Tilt mechanism',
  padding: 'Cushioning & accessories',
  straps: 'Support straps',
  hardware: 'Hardware',
}

function Nav() {
  const links = [
    ['overview', 'Overview'],
    ['configurator', '3D configurator'],
    ['research', 'Ergonomics research'],
    ['dimensions', 'Dimensions'],
    ['bom', 'Materials & parts'],
    ['structure', 'Structural spec'],
    ['assembly', 'Assembly / disassembly'],
    ['safety', 'Safety'],
  ] as const
  return (
    <nav className="sticky top-0 z-20 border-b" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
      <div className="mx-auto max-w-6xl flex gap-1 overflow-x-auto px-4 py-2 text-[13px] font-display">
        {links.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="whitespace-nowrap px-3 py-1.5 hover:opacity-70"
            style={{ color: 'var(--ink)' }}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="font-mono text-[11px] tracking-widest uppercase mb-1" style={{ color: 'var(--steel)' }}>
        {kicker}
      </p>
      <h2 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
    </div>
  )
}

function Callout({ tone, label, children }: { tone: 'safety' | 'note'; label: string; children: React.ReactNode }) {
  const color = tone === 'safety' ? 'var(--orange)' : 'var(--steel)'
  const bg = tone === 'safety' ? 'var(--orange-soft)' : 'var(--steel-wash)'
  return (
    <div className="my-4 max-w-[66ch] border-l-4 px-4 py-3" style={{ borderColor: color, background: bg }}>
      <span className="font-display text-[12px] tracking-wide block mb-1" style={{ color }}>
        {label}
      </span>
      <div className="text-[14.5px]" style={{ color: 'var(--ink)' }}>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<ViewState>('sit')
  const [selected, setSelected] = useState<string>('')
  const part = selected ? PARTS[selected] : null

  return (
    <div style={{ background: 'var(--paper)', color: 'var(--ink)', minHeight: '100vh' }}>
      <header className="border-b px-4 py-8" style={{ borderColor: 'var(--ink)', borderBottomWidth: 2 }}>
        <div className="mx-auto max-w-6xl">
          <p className="font-display text-[12px] tracking-widest" style={{ color: 'var(--steel)' }}>
            Assistive Device — Interactive Build Configurator
          </p>
          <h1 className="font-display text-3xl md:text-5xl mt-1" style={{ color: 'var(--ink)' }}>
            Recline-to-Stand Support Chair
          </h1>
          <p className="max-w-[62ch] mt-3 text-[15.5px]" style={{ color: 'var(--ink-soft)' }}>
            A full-body-support welded frame for a patient who cannot move or brace any part of the body — reclines
            flat for transfer, tilts to a supported recline for rest, and tilts upright to supported standing, all
            through a single hinged padded board and a locking gas-strut mechanism. Built to match a proven
            commercial tilt-table pattern, sized and specified for home fabrication with welding access.
          </p>
        </div>
      </header>

      <Nav />

      <main className="mx-auto max-w-6xl px-4">
        <section id="overview" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="01 — Overview" title="What this device is" />
          <p className="max-w-[66ch] text-[15.5px] mb-3">
            Unlike a walker-style gait trainer that assumes some arm strength or grip, this is a passive tilt-table:
            one continuous padded board, hinged at the hip to a base-mounted mast and at the knee partway along its
            length, that carries 100% of body weight through straps and cushioning at every angle — from flat
            (for transfer), through a supported recline (for rest), to fully upright (for supported standing).
          </p>
          <Callout tone="safety" label="Before you weld anything">
            <p className="mb-2">
              Get a physiotherapist or occupational therapist to check the fit and review this design before first
              use — this guide gets you a solid, researched design; a clinician calibrates it to the patient's
              actual condition.
            </p>
            <p>
              In India, the ALIMCO/ADIP scheme provides free or subsidised custom assistive devices on a doctor's
              prescription — worth pursuing in parallel with a home build.
            </p>
          </Callout>
        </section>

        <section id="configurator" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="02 — Interactive model" title="3D configurator" />
          <p className="max-w-[66ch] text-[15.5px] mb-4">
            Drag to orbit. Step through the four states below, or click any part of the model to see its material
            and size. This mirrors exactly how the physical frame assembles and disassembles.
          </p>

          <div className="border" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
            <div style={{ height: 460 }}>
              <Scene state={state} onSelect={setSelected} />
            </div>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--line)' }}>
              <div className="flex gap-2 flex-wrap">
                {STATE_LABELS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setState(key)}
                    className="font-display text-[13px] px-4 py-2 border"
                    style={{
                      borderColor: state === key ? 'var(--ink)' : 'var(--line)',
                      background: state === key ? 'var(--ink)' : 'var(--paper)',
                      color: state === key ? 'var(--paper)' : 'var(--ink)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[12px] italic ml-auto" style={{ color: 'var(--ink-soft)' }}>
                Drag / swipe to rotate · click a part for details
              </span>
            </div>
            <div className="px-4 py-3 border-t min-h-[64px]" style={{ borderColor: 'var(--line)' }}>
              {part ? (
                <div className="flex flex-wrap gap-x-8 gap-y-1 items-baseline">
                  <span className="font-display text-[14px]" style={{ color: 'var(--orange)' }}>
                    {part.name}
                  </span>
                  <span className="font-mono text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                    {part.material}
                  </span>
                  <span className="font-mono text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                    {part.size}
                  </span>
                </div>
              ) : (
                <span className="text-[13px] italic" style={{ color: 'var(--ink-soft)' }}>
                  Click any part in the model to see its spec here.
                </span>
              )}
            </div>
          </div>
        </section>

        <section id="research" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="03 — Research" title="Ergonomic &amp; clinical grounding" />
          <p className="max-w-[66ch] text-[15.5px] mb-6">
            Every design decision below traces back to published seating, standing-frame and pressure-care guidance
            for progressive neuromuscular conditions, not assumption.
          </p>
          <div className="space-y-8">
            {researchFindings.map((f) => (
              <div key={f.title} className="max-w-[70ch]">
                <h3 className="font-display text-[16px] mb-2" style={{ color: 'var(--steel)' }}>
                  {f.title}
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-[14.5px] mb-2">
                  {f.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px]" style={{ color: 'var(--steel)' }}>
                  {f.citations.map((c) => (
                    <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="dimensions" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="04 — Fit" title="Measure before you cut steel" />
          <p className="max-w-[66ch] text-[15.5px] mb-4">
            Every dimension should come from the patient's own body, taken lying down (the whole board is
            measurable flat, unlike a seated-only chair).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[560px]">
              <thead>
                <tr className="border-b-2" style={{ borderColor: 'var(--ink)' }}>
                  <th className="text-left py-2 pr-4 font-display text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>Measurement</th>
                  <th className="text-left py-2 pr-4 font-display text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>How to take it</th>
                  <th className="text-right py-2 pl-4 font-display text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>Typical range</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {dimensions.map((d) => (
                  <tr key={d.measurement} className="border-b" style={{ borderColor: 'var(--line)' }}>
                    <td className="py-2 pr-4 font-sans" style={{ fontFamily: 'var(--font-body)' }}>{d.measurement}</td>
                    <td className="py-2 pr-4 text-[13px] font-sans" style={{ color: 'var(--ink-soft)', fontFamily: 'var(--font-body)' }}>{d.how}</td>
                    <td className="py-2 pl-4 text-right text-[13px]" style={{ color: 'var(--ink-soft)' }}>{d.typical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="bom" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="05 — Materials" title="Full parts list" />
          {(['base', 'mechanism', 'board', 'padding', 'straps', 'hardware'] as const).map((group) => (
            <div key={group} className="mb-6">
              <h3 className="font-display text-[13px] tracking-wide mb-2" style={{ color: 'var(--steel)' }}>
                {GROUP_LABEL[group]}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] min-w-[560px]">
                  <tbody>
                    {bom
                      .filter((b) => b.group === group)
                      .map((b) => (
                        <tr key={b.part} className="border-b" style={{ borderColor: 'var(--line)' }}>
                          <td className="py-2 pr-4" style={{ minWidth: 180 }}>{b.part}</td>
                          <td className="py-2 pr-4" style={{ color: 'var(--ink-soft)' }}>{b.spec}</td>
                          <td className="py-2 pl-4 text-right font-mono" style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{b.qty}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>

        <section id="structure" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="06 — Structure" title="Structural elements" />
          <div className="space-y-5 max-w-[70ch]">
            {structuralNotes.map((s) => (
              <div key={s.element}>
                <h3 className="font-display text-[14px] mb-1" style={{ color: 'var(--orange)' }}>{s.element}</h3>
                <p className="text-[14.5px]">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="assembly" className="section py-10 border-b" style={{ borderColor: 'var(--line)' }}>
          <SectionHeading kicker="07 — Assembly" title="Disassembly &amp; reassembly" />
          <p className="max-w-[66ch] text-[15.5px] mb-6">
            The frame separates at bolts it was built with anyway — for moving house, doorways, cleaning, or
            transport.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-display text-[14px] mb-3" style={{ color: 'var(--steel)' }}>Dismantling</h3>
              <ol className="space-y-4">
                {disassembleSteps.map((s, i) => (
                  <li key={s.title} className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex gap-3">
                      <span className="font-mono text-[12px]" style={{ color: 'var(--orange)' }}>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <h4 className="font-semibold text-[14.5px] mb-0.5">{s.title}</h4>
                        <p className="text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>{s.body}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="font-display text-[14px] mb-3" style={{ color: 'var(--steel)' }}>Reassembly</h3>
              <ol className="space-y-4">
                {reassembleSteps.map((s, i) => (
                  <li key={s.title} className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex gap-3">
                      <span className="font-mono text-[12px]" style={{ color: 'var(--orange)' }}>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <h4 className="font-semibold text-[14.5px] mb-0.5">{s.title}</h4>
                        <p className="text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>{s.body}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="safety" className="section py-10">
          <SectionHeading kicker="08 — Safety" title="Testing &amp; checklist" />
          <Callout tone="safety" label="Load-test empty, every time, before first use">
            Load the board with sandbags to 1.5× patient body weight, cycle through the full range slowly twice, and
            check every weld and bolt after. Only proceed to a human trial once this passes with no flex or
            movement at the welds.
          </Callout>
          <h3 className="font-display text-[13px] tracking-wide mt-6 mb-2" style={{ color: 'var(--steel)' }}>
            Every-use checklist
          </h3>
          <ul className="space-y-2 max-w-[64ch]">
            {safetyChecklist.map((item) => (
              <li key={item} className="flex gap-3 text-[14.5px]">
                <span className="mt-1 w-3.5 h-3.5 border flex-shrink-0" style={{ borderColor: 'var(--ink-soft)' }} />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t px-4 py-6 text-[13px]" style={{ borderColor: 'var(--ink)', borderTopWidth: 2, color: 'var(--ink-soft)' }}>
        <div className="mx-auto max-w-6xl">
          Schematic reference only — confirm final dimensions against the patient's own measurements, and have a
          physiotherapist or occupational therapist check fit before regular use.
        </div>
      </footer>
    </div>
  )
}
