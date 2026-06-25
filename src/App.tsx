import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Menu, X, Zap, Palette, Gauge, Users, Star, ExternalLink } from 'lucide-react'

function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
    setMobileOpen(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email) return
    // Simulate send
    setTimeout(() => {
      setSubmitted(true)
      setFormData({ name: '', email: '', message: '' })
      setTimeout(() => setSubmitted(false), 2800)
    }, 420)
  }

  const features = [
    { icon: Zap, title: 'Instant motion', desc: '60fps interactions. Thoughtful springs and easing that feel alive.' },
    { icon: Palette, title: 'Precision design', desc: 'Every pixel, spacing token, and type scale considered for clarity.' },
    { icon: Gauge, title: 'Performance native', desc: 'Sub-100ms interactions. Images optimized. Zero bloat by default.' },
    { icon: Users, title: 'Human first', desc: 'Accessibility baked in. Keyboard, screen readers, reduced motion.' },
  ]

  const projects = [
    { title: 'Atlas', role: 'Product Design + Engineering', year: '2025', desc: 'Enterprise dashboard that reduced task time 47%.' },
    { title: 'Lumen', role: 'Design System', year: '2025', desc: 'Full token system + component library for fintech.' },
    { title: 'Orbit', role: 'Landing + WebGL', year: '2024', desc: 'Interactive 3D product experience with scroll choreography.' },
  ]

  const testimonials = [
    { quote: "Aether delivered the cleanest, fastest interface we've ever shipped. Our users noticed immediately.", name: "Priya Patel", role: "Head of Product, Linear" },
    { quote: "Best attention to motion and typography I have seen in a long time. They raised the bar for the whole team.", name: "Marcus Chen", role: "Design Director, Vercel" },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#a1a1aa] selection:bg-[#6366f1] selection:text-white">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-6 h-6 rounded-full bg-[#6366f1]" />
            <span className="font-semibold tracking-[-0.5px] text-[#fafafa] text-xl">AETHER</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-9 text-sm">
            <button onClick={() => scrollTo('work')} className="nav-link">Work</button>
            <button onClick={() => scrollTo('services')} className="nav-link">Services</button>
            <button onClick={() => scrollTo('process')} className="nav-link">Process</button>
            <button onClick={() => scrollTo('contact')} className="nav-link">Contact</button>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => scrollTo('contact')}
              className="btn btn-primary hidden md:inline-flex text-sm"
            >
              Start project <ArrowRight size={16} />
            </button>
            <button 
              onClick={() => setMobileOpen(!mobileOpen)} 
              className="md:hidden p-2 text-[#fafafa]"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }} 
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-[#242428] bg-[#0a0a0c] px-6 py-6 flex flex-col gap-4 text-sm"
            >
              {['work','services','process','contact'].map(id => (
                <button key={id} onClick={() => scrollTo(id)} className="text-left py-1 text-[#fafafa] capitalize">{id}</button>
              ))}
              <button onClick={() => scrollTo('contact')} className="btn btn-primary mt-2 w-full justify-center">
                Start project
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* HERO */}
      <section className="pt-20 pb-24 md:pb-32 max-w-5xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111113] border border-[#242428] text-xs tracking-[1px] mb-6 mt-8 text-[#a1a1aa]">
          EST. 2023 — 38 PROJECTS SHIPPED
        </div>

        <h1 className="text-[56px] md:text-[80px] leading-[0.92] tracking-[-5.2px] font-semibold text-[#fafafa] mb-6">
          Interfaces<br />that feel inevitable.
        </h1>
        <p className="max-w-[620px] mx-auto text-xl md:text-2xl text-[#a1a1aa] mb-10 tracking-[-0.2px]">
          We design and build digital products with obsessive attention to motion, typography, and performance.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => scrollTo('contact')} className="btn btn-primary text-base px-8">
            Start a project <ArrowRight size={18} />
          </button>
          <button onClick={() => scrollTo('work')} className="btn btn-secondary text-base px-8">
            See the work
          </button>
        </div>
        
        <div className="mt-16 flex justify-center gap-8 text-xs text-[#52525b] tracking-[1.5px]">
          <div>FRAMER MOTION</div>
          <div>DESIGN SYSTEMS</div>
          <div>WEBGL / THREE</div>
          <div>PRODUCTION NEXT</div>
        </div>
      </section>

      {/* TRUST / STATS */}
      <div className="border-y border-[#242428] py-6">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap justify-between gap-y-6 text-sm text-[#52525b]">
          <div>Featured in <span className="text-[#a1a1aa]">FWA</span> • <span className="text-[#a1a1aa]">AWWWARDS</span></div>
          <div>Worked with founders at Vercel, Linear, Stripe, Notion</div>
          <div>100% on-time delivery. Avg NPS 94</div>
        </div>
      </div>

      {/* WORK */}
      <section id="work" className="section max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="flex items-baseline justify-between mb-10">
          <div>
            <div className="uppercase tracking-[3px] text-xs text-[#52525b] mb-1">SELECTED WORK</div>
            <h2 className="text-5xl tracking-[-1.5px] text-[#fafafa]">Crafted with care</h2>
          </div>
          <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo('contact') }} className="hidden md:flex items-center gap-1 text-sm hover:text-[#fafafa]">View all projects <ExternalLink size={15} /></a>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {projects.map((p, i) => (
            <motion.div 
              key={i} 
              whileHover={{ y: -4 }}
              className="card rounded-3xl p-8 group cursor-pointer"
              onClick={() => scrollTo('contact')}
            >
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="text-[#fafafa] text-3xl tracking-[-0.8px] font-medium mb-1 group-hover:text-[#818cf8] transition-colors">{p.title}</div>
                  <div className="text-sm text-[#52525b]">{p.role}</div>
                </div>
                <div className="text-xs font-mono text-[#52525b] pt-1">{p.year}</div>
              </div>
              <p className="text-[15px] leading-snug">{p.desc}</p>
              <div className="mt-8 text-[#6366f1] text-xs flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">VIEW CASE STUDY <ArrowRight size={13} /></div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="section max-w-6xl mx-auto px-6 py-20 border-t border-[#242428]">
        <div className="max-w-xl mb-12">
          <div className="uppercase tracking-[3px] text-xs text-[#52525b] mb-2">WHAT WE DO</div>
          <h2 className="text-5xl tracking-[-1.6px] text-[#fafafa]">End-to-end digital craft</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, idx) => {
            const Icon = f.icon
            return (
              <div key={idx} className="card rounded-3xl p-7 flex flex-col">
                <div className="w-10 h-10 rounded-xl bg-[#18181b] flex items-center justify-center mb-8">
                  <Icon size={20} className="text-[#818cf8]" />
                </div>
                <div className="text-[#fafafa] text-[21px] tracking-[-0.3px] font-medium mb-3">{f.title}</div>
                <p className="text-[15px] leading-tight text-[#a1a1aa] mt-auto">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* PROCESS */}
      <section id="process" className="section max-w-5xl mx-auto px-6 py-20 border-t border-[#242428]">
        <div className="grid md:grid-cols-12 gap-x-8 gap-y-12">
          <div className="md:col-span-5">
            <div className="uppercase tracking-[3px] text-xs text-[#52525b]">HOW WE WORK</div>
            <h2 className="text-[46px] leading-none tracking-[-1.8px] text-[#fafafa] mt-3">Four weeks.<br />One obsession.</h2>
          </div>
          <div className="md:col-span-7 space-y-8 pt-1 text-[15px]">
            {[
              ["01", "Discover", "Deep research, user interviews, competitive audit, and goal alignment."],
              ["02", "Design", "High-fidelity prototypes, full interaction specs, and component system."],
              ["03", "Build", "Production-grade code. TypeScript, accessibility, and performance baked in."],
              ["04", "Ship + Iterate", "Launch, analytics, A/B tests, and rapid refinements post-launch."]
            ].map(([num, title, desc]) => (
              <div key={num} className="flex gap-6 border-b border-[#242428] pb-7 last:border-0 last:pb-0">
                <div className="font-mono text-[#52525b] w-8 shrink-0 pt-px">{num}</div>
                <div>
                  <div className="text-[#fafafa] tracking-[-0.2px] text-xl mb-1.5">{title}</div>
                  <div>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="border-y border-[#242428] py-16">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-2 gap-7">
          {testimonials.map((t, i) => (
            <div key={i} className="glass rounded-3xl p-9">
              <div className="flex gap-1 mb-8">
                {Array.from({ length: 5 }).map((_, k) => <Star key={k} size={15} className="text-[#6366f1]" />)}
              </div>
              <blockquote className="text-[#fafafa] text-[21px] leading-tight tracking-[-0.3px] mb-9">“{t.quote}”</blockquote>
              <div>
                <div className="text-[#fafafa] font-medium">{t.name}</div>
                <div className="text-sm text-[#52525b]">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="mx-auto max-w-[620px]">
          <h2 className="text-[#fafafa] text-6xl tracking-[-2.2px] leading-none mb-4">Ready to build something rare?</h2>
          <p className="text-xl mb-9">We take on a small number of projects each quarter.</p>
          <button onClick={() => scrollTo('contact')} className="btn btn-primary text-lg px-10 py-4">Let's talk</button>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="section border-t border-[#242428] bg-[#050506]">
        <div className="max-w-2xl mx-auto px-6 py-20">
          <div className="mb-9">
            <div className="uppercase tracking-[2px] text-xs text-[#52525b]">NEXT STEP</div>
            <h2 className="text-[#fafafa] text-5xl tracking-[-1.2px] mt-2">Tell us about the project</h2>
          </div>

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-3xl p-12 text-center"
              >
                <div className="text-[#6366f1] mb-4">Thanks — message received.</div>
                <p className="text-[#fafafa] text-2xl tracking-tight">We'll reply within 24 hours.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input 
                    type="text" 
                    placeholder="Your name" 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="glass rounded-2xl px-6 py-4 placeholder:text-[#52525b] focus:outline-none focus:border-[#6366f1] border border-[#242428] text-[#fafafa]" 
                    required 
                  />
                  <input 
                    type="email" 
                    placeholder="Email address" 
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="glass rounded-2xl px-6 py-4 placeholder:text-[#52525b] focus:outline-none focus:border-[#6366f1] border border-[#242428] text-[#fafafa]" 
                    required 
                  />
                </div>
                <textarea 
                  rows={5} 
                  placeholder="What are you trying to build? Timeline and scope help." 
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="glass w-full rounded-3xl px-6 py-4 placeholder:text-[#52525b] focus:outline-none focus:border-[#6366f1] border border-[#242428] text-[#fafafa] resize-y" 
                />
                <button type="submit" className="btn btn-primary w-full py-[17px] text-base mt-2">
                  Send inquiry <ArrowRight size={17} />
                </button>
                <p className="text-center text-xs text-[#52525b] pt-2">Or email us directly at <span className="text-[#a1a1aa]">hello@aether.studio</span></p>
              </form>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#242428] py-10 text-xs text-[#52525b]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-y-3">
          <div>© {new Date().getFullYear()} Aether Studio. All rights reserved.</div>
          <div className="flex gap-x-6">
            <a href="https://x.com" target="_blank" className="hover:text-[#a1a1aa]">X</a>
            <a href="https://instagram.com" target="_blank" className="hover:text-[#a1a1aa]">Instagram</a>
            <a href="https://are.na" target="_blank" className="hover:text-[#a1a1aa]">Are.na</a>
            <span className="hidden md:inline">•</span>
            <span>Los Angeles / Remote</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
