import { useState, useRef } from 'react'
import { importDelegationsJson, saveDelegation, type StoredDelegation } from '../lib/storage'
import { Card, Btn, Mono } from '../ui/components'
import { IconLink, IconCheck, IconDoc, IconAlert } from '../ui/icons'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function ImportDelegation() {
  const [jsonInput, setJsonInput] = useState('')
  const [imported, setImported] = useState<StoredDelegation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function parseInput(text: string) {
    setError(null)
    setImported(null)
    setSaved(false)
    try {
      setImported(importDelegationsJson(text))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse delegation JSON')
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setJsonInput(text)
      parseInput(text)
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleSave() {
    if (!imported) return
    imported.forEach(saveDelegation)
    setSaved(true)
  }

  return (
    <div className="rise max-w-xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Import</h1>
      <p className="text-dim text-sm mt-1">Load a signed subscription JSON shared with you, to charge or track it.</p>

      <Card className="p-6 mt-5 space-y-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-8 text-center cursor-pointer transition-colors"
          style={{ boxShadow: `inset 0 0 0 1.5px ${dragOver ? 'var(--accent-line)' : 'var(--color-line)'}`, background: dragOver ? 'var(--accent-soft)' : 'transparent' }}
        >
          <div className="grid place-items-center w-11 h-11 rounded-2xl bg-raised ring-1 ring-line mx-auto text-faint"><IconDoc size={20} /></div>
          <p className="text-sm text-dim mt-3">Drop a JSON file or <span style={{ color: 'var(--accent)' }}>click to browse</span></p>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        <div>
          <label className="text-sm font-medium text-ink block mb-1.5">Or paste JSON</label>
          <textarea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} rows={7} placeholder='{"delegation": {…}, "meta": {…}}' className="font-mono text-xs" />
          <div className="mt-2">
            <Btn kind="secondary" icon={<IconLink size={16} />} onClick={() => parseInput(jsonInput)} disabled={!jsonInput.trim()}>Parse JSON</Btn>
          </div>
        </div>

        {error && (
          <div className="rounded-xl px-3 py-2 text-sm text-danger flex items-center gap-2" style={{ background: 'rgba(251,113,133,.10)', boxShadow: 'inset 0 0 0 1px rgba(251,113,133,.30)' }}>
            <IconAlert size={15} /> {error}
          </div>
        )}

        {imported && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Found {imported.length} subscription{imported.length !== 1 ? 's' : ''}</h3>
            {imported.map((d, i) => (
              <div key={i} className="rounded-xl bg-raised ring-1 ring-line p-3 text-xs space-y-1.5">
                <div className="flex justify-between gap-3"><span className="text-faint">Label</span><span className="text-ink truncate">{d.meta.label}</span></div>
                <div className="flex justify-between gap-3"><span className="text-faint">Delegate</span><Mono className="text-dim">{short(d.delegation.delegate)}</Mono></div>
                <div className="flex justify-between gap-3"><span className="text-faint">Status</span><span className="text-dim">{d.meta.status}</span></div>
              </div>
            ))}
            {saved ? (
              <div className="rounded-xl px-3 py-2 text-sm flex items-center gap-2" style={{ background: 'rgba(52,211,153,.08)', boxShadow: 'inset 0 0 0 1px rgba(52,211,153,.22)', color: '#34D399' }}>
                <IconCheck size={15} /> Saved locally
              </div>
            ) : (
              <Btn kind="primary" onClick={handleSave}>Save subscription{imported.length !== 1 ? 's' : ''}</Btn>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
