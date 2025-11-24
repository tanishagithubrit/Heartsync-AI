import React, { useState } from 'react';

export default function ChatApp() {
  const [messages, setMessages] = useState([]); // {role,text,emotion}
  const [input, setInput] = useState('');
  const userId = 'user-123'; // replace with real auth in production

  async function send() {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    const payload = { userId, text: input };
    setInput('');
    try {
      const rav = await fetch('http://localhost:4000/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      const assistant = body.assistant;
      // assistant has text and emotion
      setMessages(prev => [...prev, { role: 'assistant', text: assistant.text, emotion: assistant.emotion }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', text: "Sorry — can't reach the server." }]);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '2rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>HEART Sync AI</h2>
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, minHeight: 300 }}>
        {messages.length === 0 && <div style={{ color: '#666' }}>Say something — the AI will listen.</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '12px 0' }}>
            <div style={{ fontSize: 13, color: m.role === 'user' ? '#0b61ff' : '#0b7a3b' }}>{m.role}</div>
            <div style={{ padding: 10, background: m.role === 'user' ? '#eef6ff' : '#f0fff4', borderRadius: 6 }}>{m.text}</div>
            {m.emotion && <div style={{ fontSize: 12, color: '#666' }}>detected: {m.emotion}</div>}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #ccc' }}
          placeholder="Share your feeling here..."
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button onClick={send} style={{ padding: '0 16px' }}>Send</button>
      </div>
    </div>
  );
}
