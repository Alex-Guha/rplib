// Token grammar for dimension fields in component definitions:
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := number | ident | '(' expr ')' | '-' factor
//   ident  := 'h' | 'w' | 's' | 'x' | 'y'        (x≡w, y≡h)
//   number := JS float; "2h" is sugar for "2 * h"
//
// Resolution is opt-in: numbers pass through unchanged, and strings that don't
// fully tokenize against this grammar (text, positions, colors, etc.) pass
// through unchanged too. That keeps the resolver safe to run on every value of
// a cloned component without an allowlist.

const IDENT_MAP = { h: 'height', y: 'height', w: 'width', x: 'width', s: 'separation' };

function tokenize(str) {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
        const c = str[i];
        if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
        if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')') {
            tokens.push({ type: c });
            i++;
            continue;
        }
        if ((c >= '0' && c <= '9') || c === '.') {
            let j = i;
            let sawDot = false;
            while (j < str.length) {
                const cj = str[j];
                if (cj >= '0' && cj <= '9') { j++; continue; }
                if (cj === '.' && !sawDot) { sawDot = true; j++; continue; }
                break;
            }
            const slice = str.slice(i, j);
            if (slice === '.') return null;
            const num = parseFloat(slice);
            if (!Number.isFinite(num)) return null;
            tokens.push({ type: 'num', value: num });
            i = j;
            continue;
        }
        if (Object.hasOwn(IDENT_MAP, c)) {
            tokens.push({ type: 'ident', value: c });
            i++;
            continue;
        }
        return null;
    }
    return tokens;
}

function parse(tokens, shape) {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function identValue(name) {
        const key = IDENT_MAP[name];
        const v = shape?.[key];
        if (typeof v !== 'number') throw new Error(`missing shape.${key}`);
        return v;
    }

    function maybeImplicitMul(left) {
        const n = peek();
        if (n && n.type === 'ident') {
            consume();
            return left * identValue(n.value);
        }
        return left;
    }

    function parseFactor() {
        const t = peek();
        if (!t) throw new Error('unexpected end');
        if (t.type === '-') { consume(); return -parseFactor(); }
        if (t.type === '(') {
            consume();
            const v = parseExpr();
            if (!peek() || peek().type !== ')') throw new Error('missing )');
            consume();
            return maybeImplicitMul(v);
        }
        if (t.type === 'num') {
            consume();
            return maybeImplicitMul(t.value);
        }
        if (t.type === 'ident') {
            consume();
            return identValue(t.value);
        }
        throw new Error('unexpected token');
    }

    function parseTerm() {
        let left = parseFactor();
        while (peek() && (peek().type === '*' || peek().type === '/')) {
            const op = consume().type;
            const right = parseFactor();
            left = op === '*' ? left * right : left / right;
        }
        return left;
    }

    function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().type === '+' || peek().type === '-')) {
            const op = consume().type;
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    const value = parseExpr();
    return { value, pos };
}

export function parseDimensionToken(value, shape) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const tokens = tokenize(trimmed);
    if (!tokens || tokens.length === 0) return value;
    try {
        const { value: result, pos } = parse(tokens, shape);
        if (pos !== tokens.length) return value;
        if (!Number.isFinite(result)) return value;
        return result;
    } catch {
        return value;
    }
}

export function resolveItemDimensions(item, shape) {
    if (item == null || typeof item !== 'object') return;
    if (Array.isArray(item)) {
        for (let i = 0; i < item.length; i++) {
            const v = item[i];
            if (typeof v === 'string') {
                const r = parseDimensionToken(v, shape);
                if (typeof r === 'number') item[i] = r;
            } else if (v !== null && typeof v === 'object') {
                resolveItemDimensions(v, shape);
            }
        }
        return;
    }
    for (const k of Object.keys(item)) {
        const v = item[k];
        if (typeof v === 'string') {
            const r = parseDimensionToken(v, shape);
            if (typeof r === 'number') item[k] = r;
        } else if (v !== null && typeof v === 'object') {
            resolveItemDimensions(v, shape);
        }
    }
}
