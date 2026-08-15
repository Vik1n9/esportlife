/**
 * 內容編輯器（S18a）——表單渲染與驗證（由 schema 驅動）。
 *
 * 規格：V4 §14.7（七項核心功能＋圖譜）、§14.8（關係檢查與編輯指南）、
 * §14.8.1（事件卡與特質卡同一編輯器，雙向連結與即時預覽）。
 *
 * 這個檔不含任何欄位名清單——全部來自 tools/schema.js 與 src/data/*。schema 變了
 * 只改 schema.js。工具是唯讀消費者：import src 的資料模組只為填下拉與載入既有條目，
 * 不修改遊戲程式。
 *
 * 輸出只有剪貼簿與下載 .js 片段（無 File System Access API、無後端）。
 */
import {
  SCHEMAS, ATTR_LABELS, MENTAL_LABELS, SKILL_LABELS, SLOT_LABELS, SUB_LABELS,
  POOL_LABELS, TIER_LABELS, SIDE_LABELS, CARD_TIER_LABELS, CARD_POOL_LABELS,
  QUEST_TYPE_LABELS, EFFECT_OP_LABELS, EFFECT_KEYS_LABELS, FLAG_LABELS,
  STAGES, COND_OPS, PREDICATES, ALL_TRAIT_KEYS, TRAIT_KEY_LABELS,
  validateCond, validateEffects, validateEventCard,
  checkMaterialConflicts, checkDeadRecipes, checkTriggerBreakage,
  checkEffectConsumption, checkPoolAssignment, checkInnatePoolSize, sourceOf,
} from './schema.js';
import { BASE_TRAITS, RARE_TRAITS } from '../src/data/traits.js';
import { EPIC_TRAITS, LEGENDARY_TRAITS, FUSIONS } from '../src/data/epics.js';
import { EVENT_CARDS } from '../src/data/events.js';
import { TRAINING_CARDS } from '../src/data/trainingCards.js';
import { QUEST_CARDS } from '../src/data/quests.js';
import { INNATE_POOL } from '../src/data/innate.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== '') node.textContent = text;
  return node;
};

/* ================= 每類資料的「來源＋載入」 ================= */

const TRAIT_SOURCES = [
  ['common', BASE_TRAITS, 'data/traits.js'],
  ['rare', RARE_TRAITS, 'data/traits.js'],
  ['epic', EPIC_TRAITS, 'data/epics.js'],
  ['legend', LEGENDARY_TRAITS, 'data/epics.js'],
];

function loadTraits() {
  const out = [];
  for (const [, table] of TRAIT_SOURCES) {
    for (const [key, t] of Object.entries(table)) out.push({ ...t, key });
  }
  return out;
}

function loadAll() {
  return {
    event: EVENT_CARDS.map((c) => ({ ...c })),
    trainingCard: TRAINING_CARDS.map((c) => ({ ...c })),
    quest: QUEST_CARDS.map((q) => ({ ...q })),
    trait: loadTraits(),
    fusion: FUSIONS.map((f) => ({ ...f, need: f.need.map((n) => [...n]) })),
    innate: INNATE_POOL.map((t) => ({ ...t, mentalBias: t.mentalBias ? { ...t.mentalBias } : null })),
  };
}

/* ================= 值序列化／反序列化（表單 ↔ 資料） ================= */

const ser = (v) => (v === undefined || v === null || v === '' ? '' : String(v));
const deserNum = (s) => {
  if (s === '' || s === null || s === undefined) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
};

/* ================= 表單渲染（由 schema 驅動） ================= */

/**
 * 依 fields 渲染一張表單。`value` 是資料物件，`onChange` 在任一欄位變動時被呼叫
 * （把 value 更新後存回去）。回傳 [formNode, errors]。
 */
function renderFields(fields, value, ctx, onChange) {
  const form = el('div', 'form');
  const errors = [];
  for (const f of fields) {
    const row = el('div', `f-row f-${f.type}`);
    const label = el('label', '', f.label);
    if (f.hint) label.title = f.hint;
    row.append(label);

    const wrap = el('div', 'f-ctl');
    const errs = [];
    const fieldEl = renderField(f, value, ctx, errs, onChange);
    wrap.append(fieldEl.node);
    for (const e of errs) errors.push(`${f.label}：${e}`);

    if (f.hint) wrap.append(el('div', 'hint', f.hint));
    const errBox = el('div', 'errs');
    wrap.append(errBox);
    fieldEl.onErrors(errBox);
    row.append(wrap);
    form.append(row);
  }
  return [form, errors];
}

function renderField(f, value, ctx, errs, onChange) {
  const v = value[f.key];
  const set = (next) => {
    if (next === undefined) delete value[f.key];
    else value[f.key] = next;
    onChange();
  };
  const errBox = () => {};

  switch (f.type) {
    case 'id':
    case 'text': {
      const input = el('input');
      input.value = ser(v);
      input.addEventListener('input', () => set(input.value || undefined));
      return { node: input, onErrors: () => {} };
    }
    case 'textarea': {
      const ta = el('textarea');
      ta.value = ser(v);
      ta.addEventListener('input', () => set(ta.value || undefined));
      return { node: ta, onErrors: () => {} };
    }
    case 'number': {
      const input = el('input');
      input.type = 'number';
      if (f.min != null) input.min = f.min;
      if (f.max != null) input.max = f.max;
      input.value = v === undefined || v === null ? '' : String(v);
      input.addEventListener('input', () => {
        const n = deserNum(input.value);
        if (f.min != null && n != null && n < f.min) { errs.push(`必須 ≥ ${f.min}`); }
        if (f.max != null && n != null && n > f.max) { errs.push(`必須 ≤ ${f.max}`); }
        set(n);
      });
      return { node: input, onErrors: () => {} };
    }
    case 'bool': {
      const input = el('input');
      input.type = 'checkbox';
      input.checked = !!v;
      input.addEventListener('change', () => {
        if (input.checked) set(true);
        else if (f.optional) set(undefined);
        else set(false);
      });
      return { node: input, onErrors: () => {} };
    }
    case 'enum': {
      const sel = el('select');
      const opt = el('option', '', '');
      sel.append(opt);
      for (const o of f.options) {
        const op = el('option', '', f.labels?.[o] || o);
        op.value = o;
        if (v === o) op.selected = true;
        sel.append(op);
      }
      sel.addEventListener('change', () => {
        if (sel.value === '') set(undefined);
        else set(sel.value);
      });
      if (f.required && v === undefined) errs.push('必填');
      return { node: sel, onErrors: () => {} };
    }
    case 'multienum': {
      const wrap = el('div', 'chips');
      const list = Array.isArray(v) ? v : [];
      for (const o of f.options) {
        const lab = el('label', 'chip');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = list.includes(o);
        cb.addEventListener('change', () => {
          const next = cb.checked ? [...list, o] : list.filter((x) => x !== o);
          set(next.length ? next : undefined);
        });
        lab.append(cb, el('span', '', f.labels?.[o] || o));
        wrap.append(lab);
      }
      return { node: wrap, onErrors: () => {} };
    }
    case 'cond': {
      const ta = el('textarea');
      ta.rows = 3;
      ta.placeholder = "['and', ['stat', 'age', 'gte', 30], ['has', 'epic', 'prophet']]";
      ta.value = v === undefined ? '' : JSON.stringify(v);
      const renderErrors = (box) => {
        box.textContent = '';
        if (ta.value.trim() === '') { if (f.required) errs.push('必填'); return; }
        try {
          const parsed = JSON.parse(ta.value);
          validateCond(parsed, errs, f.label);
          // 語法 OK 就回寫（保留排列給輸出用）
          value[f.key] = parsed;
        } catch (e) {
          errs.push(`JSON 語法錯誤：${e.message}`);
        }
      };
      ta.addEventListener('input', () => { renderErrors(ta.nextElementSibling); onChange(); });
      return { node: ta, onErrors: renderErrors };
    }
    case 'effect': {
      // 效果物件：鍵（從 EFFECT_KEYS 選）＋寫法＋值。特別處理訓練卡的三個特殊子鍵
      const keys = f.fields ? ['mental', 'buff', 'injury'] : null;
      const wrap = el('div', 'effect-ed');
      const render = () => {
        wrap.textContent = '';
        const map = v && typeof v === 'object' ? v : {};
        const entries = Object.entries(map);
        if (!entries.length) {
          const addBtn = el('button', 'btn-mini', '+ 加一個效果');
          addBtn.addEventListener('click', () => {
            if (f.fields) { value[f.key] = { mental: {} }; }
            else { value[f.key] = { [EFFECT_KEYS_LABELS ? firstEffectKey() : '']: { add: 0 } }; }
            onChange();
          });
          wrap.append(addBtn);
          return;
        }
        const addBtn = el('button', 'btn-mini', '+ 加一個效果');
        addBtn.addEventListener('click', () => {
          const blank = f.fields ? { mental: {} } : { [firstEffectKey()]: { add: 0 } };
          Object.assign(map, blank);
          onChange();
        });
        wrap.append(addBtn);
        for (const [ekey, evalue] of entries) {
          const row = el('div', 'eff-row');
          if (f.fields) {
            // 訓練卡效果的特殊子鍵
            const sel = el('select');
            for (const o of ['mental', 'buff', 'injury']) {
              const op = el('option', '', o);
              op.value = o;
              if (ekey === o) op.selected = true;
              sel.append(op);
            }
            sel.addEventListener('change', () => {
              if (sel.value !== ekey) {
                delete map[ekey];
                map[sel.value] = sel.value === 'injury' ? true : sel.value === 'buff' ? { id: '', label: '', months: 1 } : {};
                onChange();
              }
            });
            row.append(sel);
            const del = el('button', 'btn-mini del', '✕');
            del.addEventListener('click', () => { delete map[ekey]; onChange(); });
            row.append(del);
            if (ekey === 'mental') {
              // 心理增減：六維各給 number
              const m = evalue || {};
              for (const d of MENTAL_LABELS ? Object.keys(MENTAL_LABELS) : []) {
                const lab = el('span', 'dim', MENTAL_LABELS[d]);
                const input = el('input');
                input.type = 'number';
                input.value = m[d] ?? '';
                input.addEventListener('input', () => {
                  const n = deserNum(input.value);
                  if (n === undefined) delete m[d];
                  else m[d] = n;
                  onChange();
                });
                row.append(lab, input);
              }
            } else if (ekey === 'buff') {
              const b = evalue || {};
              const idIn = el('input');
              idIn.placeholder = 'id';
              idIn.value = b.id ?? '';
              idIn.addEventListener('input', () => { b.id = idIn.value; onChange(); });
              const labIn = el('input');
              labIn.placeholder = 'label';
              labIn.value = b.label ?? '';
              labIn.addEventListener('input', () => { b.label = labIn.value; onChange(); });
              const moIn = el('input');
              moIn.type = 'number';
              moIn.placeholder = '月數';
              moIn.value = b.months ?? '';
              moIn.addEventListener('input', () => { b.months = deserNum(moIn.value); onChange(); });
              row.append(el('span', 'dim', 'id'), idIn, el('span', 'dim', 'label'), labIn, el('span', 'dim', '月數'), moIn);
            }
          } else {
            // 一般特質效果鍵：鍵＋寫法＋值
            const sel = el('select');
            for (const k of EFFECT_KEY_OPTIONS) {
              const op = el('option', '', EFFECT_KEYS_LABELS[k] || k);
              op.value = k;
              if (ekey === k) op.selected = true;
              sel.append(op);
            }
            sel.addEventListener('change', () => {
              if (sel.value !== ekey) {
                const oldVal = map[ekey];
                delete map[ekey];
                map[sel.value] = oldVal;
                onChange();
              }
            });
            row.append(sel);
            const opSel = el('select');
            const ops = getOpsFor(ekey);
            for (const o of ops) {
              const op = el('option', '', EFFECT_OP_LABELS[o]);
              op.value = o;
              row.dataset.op = '';
              op.selected = opIs(o, evalue);
              opSel.append(op);
            }
            opSel.addEventListener('change', () => {
              map[ekey] = opSel.value === 'flag' ? true : { [opSel.value]: valueOfOp(evalue, opSel.value) };
              onChange();
            });
            row.append(opSel);
            if (opSel.value !== 'flag') {
              const input = el('input');
              input.type = 'number';
              input.step = 'any';
              input.value = ser(valueOfOp(evalue, opSel.value));
              input.addEventListener('input', () => {
                const n = deserNum(input.value);
                map[ekey] = { [opSel.value]: n };
                onChange();
              });
              row.append(input);
            }
            const del = el('button', 'btn-mini del', '✕');
            del.addEventListener('click', () => { delete map[ekey]; onChange(); });
            row.append(del);
          }
          wrap.append(row);
        }
      };
      render();
      // 驗證放在 onChange 之後由外部做（validateEffects 有完整檢查）
      return { node: wrap, onErrors: () => {} };
    }
    case 'when': {
      const wrap = el('div', 'when-ed');
      const w = v && typeof v === 'object' ? v : {};
      const render = () => {
        wrap.textContent = '';
        if (!Object.keys(w).length) {
          const addBtn = el('button', 'btn-mini', '+ 加觸發條件');
          addBtn.addEventListener('click', () => { value[f.key] = { stage: ['PRO'] }; onChange(); });
          wrap.append(addBtn);
          return;
        }
        const del = el('button', 'btn-mini del', '✕ 移除條件');
        del.addEventListener('click', () => { set(undefined); onChange(); });
        wrap.append(del);

        const stageRow = el('div', 'eff-row');
        stageRow.append(el('span', 'dim', '階段'));
        const stageSel = el('select');
        const so = el('option', '', '（不限）');
        so.value = '';
        stageSel.append(so);
        for (const s of STAGES) {
          const op = el('option', '', s);
          op.value = s;
          stageSel.append(op);
        }
        stageSel.value = Array.isArray(w.stage) && w.stage.length === 1 ? w.stage[0] : '';
        stageSel.addEventListener('change', () => { w.stage = stageSel.value ? [stageSel.value] : []; onChange(); });
        stageRow.append(stageSel);
        wrap.append(stageRow);

        const ageRow = el('div', 'eff-row');
        ageRow.append(el('span', 'dim', '年齡'));
        const a1 = el('input'); a1.type = 'number'; a1.placeholder = 'min';
        a1.value = w.minAge ?? '';
        a1.addEventListener('input', () => { w.minAge = deserNum(a1.value); onChange(); });
        const a2 = el('input'); a2.type = 'number'; a2.placeholder = 'max';
        a2.value = w.maxAge ?? '';
        a2.addEventListener('input', () => { w.maxAge = deserNum(a2.value); onChange(); });
        ageRow.append(a1, a2);
        wrap.append(ageRow);

        // 屬性範圍
        const attrRow = el('div', 'eff-row');
        attrRow.append(el('span', 'dim', '屬性'));
        const attrSel = el('select');
        const ao = el('option', '', '（選擇屬性）');
        ao.value = '';
        attrSel.append(ao);
        for (const [k, lab] of Object.entries(ATTR_LABELS)) {
          const op = el('option', '', lab);
          op.value = k;
          attrSel.append(op);
        }
        attrSel.addEventListener('change', () => {
          if (attrSel.value) {
            if (!w.attr) w.attr = {};
            if (!w.attr[attrSel.value]) w.attr[attrSel.value] = [0, 100];
            onChange();
          }
        });
        attrRow.append(attrSel);
        wrap.append(attrRow);
        for (const [k, range] of Object.entries(w.attr || {})) {
          const r = el('div', 'eff-row');
          r.append(el('span', 'dim', `attr.${k}`));
          const x1 = el('input'); x1.type = 'number'; x1.value = range[0];
          x1.addEventListener('input', () => { range[0] = deserNum(x1.value); onChange(); });
          const x2 = el('input'); x2.type = 'number'; x2.value = range[1];
          x2.addEventListener('input', () => { range[1] = deserNum(x2.value); onChange(); });
          const rm = el('button', 'btn-mini del', '✕');
          rm.addEventListener('click', () => { delete w.attr[k]; if (!Object.keys(w.attr).length) delete w.attr; onChange(); });
          r.append(x1, x2, rm);
          wrap.append(r);
        }

        // 心理範圍
        const mentRow = el('div', 'eff-row');
        mentRow.append(el('span', 'dim', '心理'));
        const mentSel = el('select');
        const mo2 = el('option', '', '（選擇維度）');
        mo2.value = '';
        mentSel.append(mo2);
        for (const [k, lab] of Object.entries(MENTAL_LABELS)) {
          const op = el('option', '', lab);
          op.value = k;
          mentSel.append(op);
        }
        mentSel.addEventListener('change', () => {
          if (mentSel.value) {
            if (!w.mental) w.mental = {};
            if (!w.mental[mentSel.value]) w.mental[mentSel.value] = [0, 100];
            onChange();
          }
        });
        mentRow.append(mentSel);
        wrap.append(mentRow);
        for (const [k, range] of Object.entries(w.mental || {})) {
          const r = el('div', 'eff-row');
          r.append(el('span', 'dim', `mental.${k}`));
          const x1 = el('input'); x1.type = 'number'; x1.value = range[0];
          x1.addEventListener('input', () => { range[0] = deserNum(x1.value); onChange(); });
          const x2 = el('input'); x2.type = 'number'; x2.value = range[1];
          x2.addEventListener('input', () => { range[1] = deserNum(x2.value); onChange(); });
          const rm = el('button', 'btn-mini del', '✕');
          rm.addEventListener('click', () => { delete w.mental[k]; if (!Object.keys(w.mental).length) delete w.mental; onChange(); });
          r.append(x1, x2, rm);
          wrap.append(r);
        }

        // 特質持有
        const traitRow = el('div', 'eff-row');
        traitRow.append(el('span', 'dim', '特質'));
        const traitSel = el('select');
        const to = el('option', '', '（選擇特質）');
        to.value = '';
        traitSel.append(to);
        for (const k of ALL_TRAIT_KEYS) {
          const op = el('option', '', TRAIT_KEY_LABELS[k]);
          op.value = k;
          traitSel.append(op);
        }
        traitSel.addEventListener('change', () => {
          if (traitSel.value) {
            w.trait = Array.isArray(w.trait) ? [...w.trait] : [];
            if (!w.trait.includes(traitSel.value)) w.trait.push(traitSel.value);
            onChange();
          }
        });
        traitRow.append(traitSel);
        wrap.append(traitRow);
        for (const k of w.trait || []) {
          const r = el('div', 'eff-row');
          r.append(el('span', 'dim', `trait.${k}`));
          const rm = el('button', 'btn-mini del', '✕');
          rm.addEventListener('click', () => { w.trait = w.trait.filter((x) => x !== k); onChange(); });
          r.append(rm);
          wrap.append(r);
        }
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    case 'outcome': {
      // { text, attr, flags }
      const wrap = el('div', 'outcome-ed');
      const o = v && typeof v === 'object' ? v : {};
      const render = () => {
        wrap.textContent = '';
        const empty = !Object.keys(o).length;
        if (empty) {
          const addBtn = el('button', 'btn-mini', '+ 編輯結果');
          addBtn.addEventListener('click', () => { value[f.key] = { text: '' }; onChange(); });
          wrap.append(addBtn);
          return;
        }
        const del = el('button', 'btn-mini del', '✕');
        del.addEventListener('click', () => { set(undefined); onChange(); });
        wrap.append(del);
        const ta = el('textarea');
        ta.rows = 2;
        ta.placeholder = '結果敘事';
        ta.value = o.text ?? '';
        ta.addEventListener('input', () => { o.text = ta.value; onChange(); });
        wrap.append(ta);
        // attr
        const aRow = el('div', 'eff-row');
        aRow.append(el('span', 'dim', '屬性'));
        const attrSel = el('select');
        const ao = el('option', '', '＋ 屬性');
        ao.value = '';
        attrSel.append(ao);
        for (const [k, lab] of Object.entries(ATTR_LABELS)) {
          const op = el('option', '', lab);
          op.value = k;
          attrSel.append(op);
        }
        attrSel.addEventListener('change', () => {
          if (attrSel.value) {
            if (!o.attr) o.attr = {};
            o.attr[attrSel.value] = 0;
            onChange();
          }
        });
        aRow.append(attrSel);
        wrap.append(aRow);
        for (const [k, val] of Object.entries(o.attr || {})) {
          const r = el('div', 'eff-row');
          r.append(el('span', 'dim', `attr.${k}`));
          const input = el('input');
          input.type = 'number';
          input.value = val;
          input.addEventListener('input', () => { o.attr[k] = deserNum(input.value); onChange(); });
          const rm = el('button', 'btn-mini del', '✕');
          rm.addEventListener('click', () => { delete o.attr[k]; if (!Object.keys(o.attr).length) delete o.attr; onChange(); });
          r.append(input, rm);
          wrap.append(r);
        }
        // flags
        const fRow = el('div', 'eff-row');
        fRow.append(el('span', 'dim', '旗標'));
        const flagSel = el('select');
        const fo = el('option', '', '＋ 旗標');
        fo.value = '';
        flagSel.append(fo);
        for (const [k, lab] of Object.entries(FLAG_LABELS)) {
          const op = el('option', '', `${k}（${lab}）`);
          op.value = k;
          flagSel.append(op);
        }
        flagSel.addEventListener('change', () => {
          if (flagSel.value) {
            if (!o.flags) o.flags = {};
            o.flags[flagSel.value] = true;
            onChange();
          }
        });
        fRow.append(flagSel);
        wrap.append(fRow);
        for (const k of Object.keys(o.flags || {})) {
          const r = el('div', 'eff-row');
          r.append(el('span', 'dim', `flag.${k}`));
          const rm = el('button', 'btn-mini del', '✕');
          rm.addEventListener('click', () => { delete o.flags[k]; if (!Object.keys(o.flags).length) delete o.flags; onChange(); });
          r.append(rm);
          wrap.append(r);
        }
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    case 'option': {
      return renderOptionField(f, v, ctx, errs, onChange);
    }
    case 'list': {
      // 子物件陣列（選項、配方素材）
      const wrap = el('div', 'list-ed');
      const list = Array.isArray(v) ? v : [];
      const render = () => {
        wrap.textContent = '';
        if (list.length < (f.max ?? Infinity)) {
          const addBtn = el('button', 'btn-mini', `+ ${f.item.label || '加一項'}`);
          addBtn.addEventListener('click', () => {
            list.push(f.item.empty || {});
            set(list);
            onChange();
          });
          wrap.append(addBtn);
        }
        list.forEach((item, i) => {
          const box = el('div', 'list-item');
          const head = el('div', 'list-head');
          head.append(el('span', 'dim', `#${i + 1}`));
          const rm = el('button', 'btn-mini del', '✕');
          rm.addEventListener('click', () => { list.splice(i, 1); set(list.length ? list : undefined); onChange(); });
          head.append(rm);
          box.append(head);
          const [sub] = renderFields(f.item.fields, item, ctx, onChange);
          box.append(sub);
          wrap.append(box);
        });
        if (list.length < (f.min ?? 0)) {
          const note = el('div', 'err', `至少 ${f.min} 個（現在 ${list.length}）`);
          wrap.append(note);
        }
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    case 'questResult': {
      const wrap = el('div', 'outcome-ed');
      const r = v && typeof v === 'object' ? v : {};
      const render = () => {
        wrap.textContent = '';
        const tierSel = el('select');
        const to = el('option', '', '（選擇階級）');
        to.value = '';
        tierSel.append(to);
        for (const t of ['legendary', 'epic']) {
          const op = el('option', '', t === 'legendary' ? 'legend 傳說特質' : 'epic 史詩特質');
          op.value = t;
          if (r.tier === t) op.selected = true;
          tierSel.append(op);
        }
        tierSel.addEventListener('change', () => {
          r.tier = tierSel.value;
          if (tierSel.value === 'epic' && r.label === undefined) r.label = '';
          onChange();
        });
        wrap.append(tierSel);
        const keySel = el('select');
        const ko = el('option', '', '（選擇特質）');
        ko.value = '';
        keySel.append(ko);
        const poolKeys = r.tier === 'epic'
          ? Object.keys(EPIC_TRAITS)
          : Object.keys(LEGENDARY_TRAITS);
        for (const k of poolKeys) {
          const op = el('option', '', TRAIT_KEY_LABELS[k] || k);
          op.value = k;
          if (r.key === k) op.selected = true;
          keySel.append(op);
        }
        keySel.addEventListener('change', () => { r.key = keySel.value; onChange(); });
        wrap.append(keySel);
        if (r.tier === 'epic') {
          const lab = el('input');
          lab.placeholder = '生涯標籤（route 卡）';
          lab.value = r.label ?? '';
          lab.addEventListener('input', () => { r.label = lab.value; onChange(); });
          wrap.append(lab);
        }
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    case 'bias': {
      const wrap = el('div', 'bias-ed');
      const b = v;
      const render = () => {
        wrap.textContent = '';
        if (b === null || b === undefined) {
          const addBtn = el('button', 'btn-mini', '+ mentalBias');
          addBtn.addEventListener('click', () => { set({ dim: 'comp', dir: 1 }); onChange(); });
          wrap.append(addBtn);
          return;
        }
        const dimSel = el('select');
        for (const d of Object.keys(MENTAL_LABELS)) {
          const op = el('option', '', MENTAL_LABELS[d]);
          op.value = d;
          if (b.dim === d) op.selected = true;
          dimSel.append(op);
        }
        dimSel.addEventListener('change', () => { b.dim = dimSel.value; onChange(); });
        const dirSel = el('select');
        for (const [dv, lab] of [[1, '正向 +6~+10'], [-1, '負向 −10~−6']]) {
          const op = el('option', '', lab);
          op.value = String(dv);
          if (b.dir === dv) op.selected = true;
          dirSel.append(op);
        }
        dirSel.addEventListener('change', () => { b.dir = Number(dirSel.value); onChange(); });
        const rm = el('button', 'btn-mini del', '✕');
        rm.addEventListener('click', () => { set(null); onChange(); });
        wrap.append(dimSel, dirSel, rm);
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    case 'mentalMap': {
      const wrap = el('div', 'effect-ed');
      const m = v && typeof v === 'object' ? v : {};
      const render = () => {
        wrap.textContent = '';
        for (const d of Object.keys(MENTAL_LABELS)) {
          const lab = el('label', 'dim');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = m[d] !== undefined;
          cb.addEventListener('change', () => {
            if (cb.checked) m[d] = 0;
            else delete m[d];
            onChange();
          });
          const num = el('input');
          num.type = 'number';
          num.value = m[d] ?? '';
          num.disabled = m[d] === undefined;
          num.addEventListener('input', () => { m[d] = deserNum(num.value); onChange(); });
          lab.append(cb, el('span', '', MENTAL_LABELS[d]), num);
          wrap.append(lab);
        }
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    case 'buff': {
      const wrap = el('div', 'buff-ed');
      const b = v && typeof v === 'object' ? v : {};
      const render = () => {
        wrap.textContent = '';
        const fields = [
          ['id', 'id'], ['label', 'label'], ['months', '月數', 'number'], ['trainBoost', '訓練加成', 'number'],
        ];
        for (const [k, lab, type] of fields) {
          const input = el('input');
          if (type === 'number') { input.type = 'number'; input.step = 'any'; }
          input.placeholder = lab;
          input.value = b[k] ?? '';
          input.addEventListener('input', () => {
            b[k] = type === 'number' ? deserNum(input.value) : input.value;
            onChange();
          });
          wrap.append(input);
        }
      };
      render();
      return { node: wrap, onErrors: () => {} };
    }
    default:
      return { node: el('span', 'err', `未知欄位型別：${f.type}`), onErrors: () => {} };
  }
}

/** 選項欄位（option）的專屬渲染：標籤＋成功率＋倍率 */
function renderOptionField(f, v, ctx, errs, onChange) {
  const wrap = el('div', 'option-ed');
  const o = v && typeof v === 'object' ? v : {};
  const fields = [
    { key: 'label', label: '選項文字', type: 'text' },
    { key: 'odds', label: '成功基準 %', type: 'number', min: 0, max: 100 },
    { key: 'gain', label: '成功倍率', type: 'number' },
    { key: 'loss', label: '失敗倍率', type: 'number' },
  ];
  const [sub, subErrs] = renderFields(fields, o, ctx, onChange);
  for (const e of subErrs) errs.push(e);
  wrap.append(sub);
  return { node: wrap, onErrors: () => {} };
}

/* ================= 效果鍵／寫法的工具函式 ================= */

const EFFECT_KEY_OPTIONS = Object.keys(EFFECT_KEYS_LABELS);

function firstEffectKey() { return EFFECT_KEY_OPTIONS[0]; }

function opIs(op, value) {
  if (op === 'flag') return value === true;
  if (typeof value === 'number') return op === 'add';
  if (value && typeof value === 'object') return value[op] !== undefined;
  return op === 'add';
}

function valueOfOp(value, op) {
  if (typeof value === 'number') return value;
  if (value === true) return op === 'flag' ? true : 0;
  if (value && typeof value === 'object' && value[op] !== undefined) return value[op];
  return 0;
}

function getOpsFor(key) {
  // 窗口鍵的寫法受 kinds 限制；mental_* 是加法；其餘全開放
  const windows = {
    peak_age_shift: 'add', rise_k_mul: 'mul', fall_k_mul: 'mul',
    fall_accel_mul: 'mul', decline_pull_mul: 'mul', growth_rate_mul: 'mul',
  };
  if (key in windows) return ['add', 'mul', 'flag'];
  return EFFECT_OP_LABELS ? Object.keys(EFFECT_OP_LABELS) : [];
}

/* ================= 驗證彙整 ================= */

function validateEntry(schemaId, value, all) {
  const schema = SCHEMAS[schemaId];
  const errors = [];
  const seen = new Set();
  if (schema.keyOf) {
    const key = schema.keyOf(value);
    if (key === undefined || key === '') errors.push('缺少辨識鍵（id／key）');
    else {
      for (const other of all) {
        const ok = schema.keyOf(other);
        if (ok === key && other !== value) { seen.add(key); }
      }
      if (seen.has(key)) errors.push(`辨識鍵「${key}」與其他條目重複`);
    }
  }
  if (schemaId === 'event') validateEventCard(value, errors, all);
  validateEffects(value.effects, errors, 'effects');
  validateEffects(value.sideEffects, errors, 'sideEffects');
  if (value.trigger !== undefined) validateCond(value.trigger, errors, 'trigger');
  if (value.goal !== undefined) validateCond(value.goal, errors, 'goal');
  if (value.maintain !== undefined && !Array.isArray(value.maintain)) {
    // 維持條件欄位在舊資料是函式（data/traits.js 的單身／圈內毒瘤）——函式無法由
    // 編輯器產出，但載入檢視時要放行；產出時函式原樣保留
    if (typeof value.maintain !== 'function') errors.push('maintain 必須是條件式陣列或函式');
  }
  return errors;
}

/* ================= 輸出（剪貼簿／下載 .js 片段） ================= */

/** 排版與既有資料檔一致：2 空格縮排、鍵值對。 */
function formatJsValue(v, indent) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function') return v.toString();
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => `${padIn}${formatJsValue(x, indent + 1)},`).join('\n')}\n${pad}]`;
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${padIn}${/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k)}: ${formatJsValue(v[k], indent + 1)},`).join('\n')}\n${pad}}`;
}

function formatEntry(schemaId, value) {
  if (schemaId === 'trait') {
    const { key, ...rest } = value;
    return `  ${key}: ${formatJsValue(rest, 1)},`;
  }
  if (schemaId === 'innate') {
    const { key, ...rest } = value;
    return `  { key: ${JSON.stringify(key)}${Object.keys(rest).length ? `, ${formatJsValue(rest, 1).slice(1, -1).trim()}` : ''} },`;
  }
  if (schemaId === 'fusion') {
    return `  ${formatJsValue(value, 1)},`;
  }
  if (schemaId === 'quest') {
    return `  ${formatJsValue(value, 1)},`;
  }
  if (schemaId === 'trainingCard') {
    return `  ${formatJsValue(value, 1)},`;
  }
  return `  ${formatJsValue(value, 1)},`;
}

/* ================= 圖譜視圖（力導向佈局，§14.7） ================= */

/**
 * 力導向佈局：節點＝特質，邊＝配方（下層素材 → 上層產物）。
 * 自製模擬（斥力＋彈簧），零相依。
 */
function runForceLayout(nodes, edges) {
  const W = 900, H = 560;
  const iter = 200;
  for (const n of nodes) {
    n.x = W * 0.2 + Math.random() * W * 0.6;
    n.y = H * 0.2 + Math.random() * H * 0.6;
    n.vx = 0; n.vy = 0;
  }
  const repulse = 900;
  const spring = 0.06;
  const center = 0.004;
  for (let i = 0; i < iter; i++) {
    // 斥力（所有節點對）
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const A = nodes[a], B = nodes[b];
        let dx = B.x - A.x, dy = B.y - A.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 1; }
        const d = Math.sqrt(d2);
        const f = repulse / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        A.vx -= fx; A.vy -= fy; B.vx += fx; B.vy += fy;
      }
    }
    // 彈簧（邊）
    for (const e of edges) {
      const A = e.from, B = e.to;
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - e.rest) * spring;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
    }
    // 中心引力
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * center;
      n.vy += (H / 2 - n.y) * center;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += n.vx; n.y += n.vy;
    }
  }
}

function renderGraph() {
  document.querySelectorAll('.graph-overlay').forEach((o) => o.remove());
  const overlay = el('div', 'graph-overlay');
  const box = el('div', 'graph-box');
  const close = el('button', 'btn-mini del', '✕ 關閉');
  close.addEventListener('click', () => overlay.remove());
  box.append(el('h3', '', '合成樹圖譜（下層素材 → 上層產物）'), close);

  // 節點：全部特質；邊：FUSIONS
  const nodes = [];
  const byKey = {};
  for (const [tier, table] of TRAIT_SOURCES) {
    for (const [key, t] of Object.entries(table)) {
      const n = { id: key, label: t.name, tier, pool: t.pool || '?', x: 0, y: 0, vx: 0, vy: 0 };
      nodes.push(n);
      byKey[key] = n;
    }
  }
  const edges = [];
  for (const f of FUSIONS) {
    const to = byKey[f.out];
    if (!to) continue;
    for (const [, key] of f.need) {
      const from = byKey[key];
      if (!from) continue;
      edges.push({ from, to, rest: 120 });
    }
  }

  runForceLayout(nodes, edges);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 900 560');
  svg.setAttribute('width', '100%');
  svg.style.height = '560px';

  for (const e of edges) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', e.from.x); line.setAttribute('y1', e.from.y);
    line.setAttribute('x2', e.to.x); line.setAttribute('y2', e.to.y);
    line.setAttribute('stroke', '#227aad'); line.setAttribute('stroke-width', '1');
    line.setAttribute('opacity', '0.5');
    svg.append(line);
  }
  const tierColor = {
    common: '#99b1b8', rare: '#7cc4ff', epic: '#c45dd6', legend: '#ffd166',
  };
  for (const n of nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', tierColor[n.tier] || '#99b1b8');
    circle.setAttribute('stroke', '#0d202b');
    g.append(circle);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('y', '-10');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#e8f0f2');
    text.textContent = `${n.label}（${n.tier}）`;
    g.append(text);
    svg.append(g);
  }
  box.append(svg);

  const legend = el('div', 'graph-legend');
  for (const [t, lab] of [['common', '通用'], ['rare', '稀有'], ['epic', '史詩'], ['legend', '傳說']]) {
    const item = el('span', '', `● ${lab}`);
    item.style.color = tierColor[t];
    legend.append(item);
  }
  box.append(legend);

  overlay.append(box);
  document.body.append(overlay);
}

/* ================= 關係檢查面板（§14.8） ================= */

function renderRelations() {
  document.querySelectorAll('.graph-overlay').forEach((o) => o.remove());
  const overlay = el('div', 'graph-overlay');
  const box = el('div', 'graph-box');
  const close = el('button', 'btn-mini del', '✕ 關閉');
  close.addEventListener('click', () => overlay.remove());
  box.append(el('h3', '', '跨資料關係檢查（§14.8）'), close);

  const run = () => {
    const old = $('.rel-results', box);
    if (old) old.remove();
    const res = el('div', 'rel-results');
    const groups = [
      ['素材競態（池內共用是取捨，跨池共用是錯誤）', checkMaterialConflicts()],
      ['死配方（素材沒有可達取得路徑）', checkDeadRecipes()],
      ['觸發斷裂（特質鍵／謂詞名／結果鍵不存在）', checkTriggerBreakage()],
      ['效果鍵不被引擎消費（打錯鍵特質靜靜地沒有效果）', checkEffectConsumption()],
      ['池指派完整（未指派預設 persona；psych／career 入合成）', checkPoolAssignment()],
      ['天生特質池上限', checkInnatePoolSize()],
    ];
    let total = 0;
    for (const [title, issues] of groups) {
      total += issues.length;
      const h = el('div', 'rel-group-title', `${title} — ${issues.length}`);
      res.append(h);
      if (!issues.length) res.append(el('div', 'rel-ok', '✓ 無問題'));
      for (const issue of issues) {
        res.append(el('div', `rel-item rel-${issue.level}`, `${issue.level === 'error' ? '✗' : '⚠'} ${issue.message}`));
      }
    }
    res.append(el('div', 'rel-total', `共 ${total} 項`));
    box.append(res);
  };
  const btn = el('button', 'btn', '重新檢查');
  btn.addEventListener('click', run);
  box.append(btn);
  run();
  overlay.append(box);
  document.body.append(overlay);
}

/* ================= 主程式：分頁、列表、表單 ================= */

const TABS = [
  ['event', '事件卡', ['event', 'trainingCard']],
  ['trait', '特質卡', ['trait']],
  ['quest', '任務卡', ['quest']],
  ['fusion', '配方', ['fusion']],
  ['innate', '天生特質', ['innate']],
];

let currentTab = 'event';
let editingKey = null;

function main() {
  const root = $('#app');
  const data = loadAll();

  // 分頁列
  const tabs = el('nav', 'tabs');
  for (const [id, label] of TABS) {
    const btn = el('button', 'tab', label);
    btn.dataset.tab = id;
    if (id === currentTab) btn.classList.add('active');
    btn.addEventListener('click', () => switchTab(id));
    tabs.append(btn);
  }
  const relBtn = el('button', 'tab rel', '關係檢查');
  relBtn.addEventListener('click', renderRelations);
  const graphBtn = el('button', 'tab rel', '合成圖譜');
  graphBtn.addEventListener('click', renderGraph);
  tabs.append(relBtn, graphBtn);
  root.append(tabs);

  const main = el('div', 'main');
  root.append(main);

  function switchTab(id) {
    currentTab = id;
    editingKey = null;
    for (const b of tabs.querySelectorAll('.tab')) {
      b.classList.toggle('active', b.dataset.tab === id);
    }
    render();
  }

  function render() {
    main.textContent = '';
    const [primary, ...rest] = TABS.find(([t]) => t === currentTab)[2];
    const schemas = rest.length ? [SCHEMAS[primary], SCHEMAS[rest[0]]] : [SCHEMAS[primary]];
    const intro = el('p', 'intro', SCHEMAS[primary].intro);
    main.append(intro);

    for (const schema of schemas) {
      const section = el('section', 'section');
      const h2 = el('h2', '', schema.label);
      section.append(h2);

      // 列表
      const list = el('div', 'list');
      const entries = data[schema.id] || [];
      const items = el('div', 'items');
      for (const entry of entries) {
        const key = schema.keyOf(entry);
        const item = el('button', 'item', String(key));
        if (key === editingKey) item.classList.add('active');
        item.addEventListener('click', () => {
          editingKey = key;
          render();
          const form = $('.form', section);
          if (form) form.scrollIntoView({ block: 'nearest' });
        });
        items.append(item);
      }
      const addBtn = el('button', 'btn-mini', '+ 新增');
      addBtn.addEventListener('click', () => {
        const blank = blankEntry(schema.id);
        data[schema.id].push(blank);
        editingKey = schema.keyOf(blank);
        render();
      });
      list.append(items, addBtn);
      section.append(list);

      // 表單
      const formWrap = el('div', 'editor');
      const current = editingKey != null ? data[schema.id].find((e) => schema.keyOf(e) === editingKey) : null;
      if (current) {
        const key = schema.keyOf(current);
        const head = el('div', 'editor-head');
        head.append(el('span', 'dim', `編輯：${key}`));
        const copyBtn = el('button', 'btn-mini', '複製條目');
        copyBtn.addEventListener('click', () => {
          const dup = structuredClone(current);
          const newKey = `${key}_copy`;
          if (schema.id === 'trait') dup.key = newKey;
          else if (schema.id === 'event') dup.id = newKey;
          else if (schema.id === 'trainingCard') dup.id = newKey;
          else if (schema.id === 'quest') dup.id = newKey;
          else if (schema.id === 'innate') dup.key = newKey;
          if (typeof dup.excl === 'string' && dup.excl.startsWith('solo_')) dup.excl = `solo_${newKey}`;
          data[schema.id].push(dup);
          editingKey = newKey;
          render();
        });
        const delBtn = el('button', 'btn-mini del', '刪除');
        delBtn.addEventListener('click', () => {
          data[schema.id] = data[schema.id].filter((e) => schema.keyOf(e) !== key);
          editingKey = null;
          render();
        });
        head.append(copyBtn, delBtn);
        formWrap.append(head);

        const [form, fErrors] = renderFields(schema.fields, current, { schemaId: schema.id }, () => {
          // 變動後重算驗證區＋更新輸出 pre（只更新，不整個重渲染——保持輸入焦點）
          const errBox = $('.live-errs', formWrap);
          if (errBox) errBox.textContent = '';
          const all = data[schema.id];
          const errors = validateEntry(schema.id, current, all);
          for (const e of errors) errBox.append(el('div', 'err', `✗ ${e}`));
          pre.textContent = formatEntry(schema.id, current);
        });
        formWrap.append(form);

        const liveErr = el('div', 'live-errs');
        formWrap.append(liveErr);
        const errors = validateEntry(schema.id, current, data[schema.id]);
        for (const e of errors) liveErr.append(el('div', 'err', `✗ ${e}`));

        // 特質卡的來源顯示
        if (schema.id === 'trait') {
          const src = sourceOf(key);
          const line = el('div', 'hint', src.length ? `取得路徑：${src.join('、')}` : '⚠ 沒有任何取得路徑（死素材風險）');
          formWrap.append(line);
        }
        // 素材來源（配方分頁）
        if (schema.id === 'fusion') {
          const mats = el('div', 'hint');
          for (const [tier, key2] of current.need || []) {
            const src = sourceOf(key2);
            mats.append(el('div', '', `素材 ${tier}/${key2}：${src.length ? src.join('、') : '⚠ 無取得路徑（死配方）'}`));
          }
          formWrap.append(mats);
        }

        // 輸出區
        const out = el('div', 'output');
        const outHead = el('div', 'editor-head');
        const pre = el('pre', '', formatEntry(schema.id, current));
        const clipBtn = el('button', 'btn-mini', '複製片段');
        clipBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(pre.textContent).then(() => {
            clipBtn.textContent = '✓ 已複製';
            setTimeout(() => { clipBtn.textContent = '複製片段'; }, 1200);
          });
        });
        const dlBtn = el('button', 'btn-mini', '下載 .js');
        dlBtn.addEventListener('click', () => {
          const blob = new Blob([pre.textContent], { type: 'text/javascript' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${schema.id}-${key}.js`;
          a.click();
          URL.revokeObjectURL(a.href);
        });
        outHead.append(el('span', 'dim', '輸出（貼回資料檔）'), clipBtn, dlBtn);
        out.append(outHead, pre);
        formWrap.append(out);
      } else {
        formWrap.append(el('div', 'muted', '← 從左邊選一個條目，或按「新增」'));
      }
      section.append(formWrap);
      main.append(section);
    }
  }

  render();
}

/** 各類資料的新增模板 */
function blankEntry(schemaId) {
  switch (schemaId) {
    case 'event':
      return {
        id: 'new_event', name: '', kind: 'normal',
        pool: ['persona'], sub: 'life', slot: ['regular'],
        excl: 'solo_new_event', prompt: '',
        options: [
          { id: 'a', label: '', odds: 50, gain: 1, loss: 1, main: true },
          { id: 'b', label: '', odds: 50, gain: 1, loss: 1 },
        ],
        good: { text: '' }, bad: { text: '' },
      };
    case 'trainingCard':
      return { id: 't_new', tier: 'success', pool: 'success', weight: 1, text: '', effects: {} };
    case 'quest':
      return {
        id: 'q_new', type: 'legend', name: '', text: '',
        trigger: ['and', ['stat', 'intlSemis', 'gte', 1]],
        goal: ['stat', 'splitTitles', 'gte', 1],
        deadline: 2, result: { tier: 'legendary', key: '' },
        failLabel: '', goalText: '', materialText: null,
      };
    case 'trait':
      return {
        key: 'new_trait', name: '', tier: 'common', pool: 'persona',
        desc: '', effects: {}, sideEffects: {}, sideEffectLevel: 'light',
      };
    case 'fusion':
      return {
        outTier: 'rare', out: '', need: [['traits', ''], ['traits', '']],
      };
    case 'innate':
      return { key: '', mentalBias: null };
    default:
      return {};
  }
}

document.addEventListener('DOMContentLoaded', main);
