import { describe, it, expect } from 'vitest';
import { analyzeSnippet } from '../src/analyzers/javascript';

describe('JS analyzer', () => {
  it('detects req.query -> concat -> db.query as High', () => {
    const code = `
      function handler(req, res, db){
        const id = req.query.id;
        const q = "SELECT * FROM users WHERE id=" + id;
        db.query(q);
      }
    `;
    const flows = analyzeSnippet(code);
    expect(flows.length).toBeGreaterThan(0);
    const f = flows[0];
    expect(f.severity === 'High' || f.severity === 'Medium').toBeTruthy();
  });
});
