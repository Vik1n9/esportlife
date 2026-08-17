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
  ACTIVITY_KEYS, ACTIVITY_LABELS,
  validateCond, validateEffects, validateEventCard,
  validateTrait, validateFusion, validateTrainingCard,
  checkMaterialConflicts, checkDeadRecipes, checkTriggerBreakage,
  checkEffectConsumption, checkPoolAssignment, checkInnatePoolSize, sourceOf,
  COND_TIERS, COND_TIER_LABELS, COND_OP_LABELS, COND_NODES, COND_NODE_LABELS,
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

/* ================= 條件式積木的小零件 ================= */

/**
 * 換節點型別時給的預設形狀。刻意**不**硬轉舊值——`['stat', 'age', 'gte', 30]` 轉成
 * `['has', …]` 沒有對應關係，硬填一個看起來像資料的值比空著更難發現填錯。
 * 唯一保留的是容器互轉（and ⇄ or）時的子條件，那個對應是真的。
 */
function defaultNode(kind, prev) {
  const kids = Array.isArray(prev) && (prev[0] === 'and' || prev[0] === 'or') ? prev.slice(1) : null;
  switch (kind) {
    case 'and': return ['and', ...(kids || [defaultNode('stat')])];
    case 'or': return ['or', ...(kids || [defaultNode('stat')])];
    case 'not': return ['not', defaultNode('stat')];
    case 'has': return ['has', COND_TIERS[0], ALL_TRAIT_KEYS[0]];
    case 'hasCount': return ['hasCount', COND_TIERS[0], 1];
    default: return ['stat', PREDICATES[0], 'gte', 0];
  }
}

/** 下拉：選項清單＋現值＋標籤表＋變動回呼 */
function pick(options, current, labels, onPick) {
  const sel = el('select');
  for (const o of options) {
    const op = el('option', '', labels?.[o] || o);
    op.value = o;
    if (o === current) op.selected = true;
    sel.append(op);
  }
  sel.addEventListener('change', () => onPick(sel.value));
  return sel;
}

function numInput(current, onSet) {
  const input = el('input', 'cond-num');
  input.type = 'number';
  input.value = current === undefined || current === null ? '' : String(current);
  // change 而非 input：積木每次變動都重畫，用 input 會每打一個字就失焦
  input.addEventListener('change', () => onSet(deserNum(input.value) ?? 0));
  return input;
}

function inline(nodes) {
  const row = el('div', 'cond-leaf');
  for (const n of nodes) row.append(n);
  return row;
}

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
      // 兩種模式共用同一份 value[f.key]：積木只產生合法結構，原始模式維持
      // 既有的 JSON textarea（25 張任務卡都是那樣寫的，不能斷）。
      // 切換不動資料，所以來回切不掉東西。
      const wrap = el('div', 'cond-wrap');
      const bar = el('div', 'cond-modes');
      const body = el('div', 'cond-body');
      let mode = 'blocks';
      let errBoxRef = null;

      const runValidate = (box) => {
        errBoxRef = box || errBoxRef;
        if (errBoxRef) errBoxRef.textContent = '';
        const cur = value[f.key];
        if (cur === undefined) { if (f.required) errs.push('必填'); return; }
        validateCond(cur, errs, f.label);
      };

      const commit = (next) => {
        if (next === undefined) delete value[f.key];
        else value[f.key] = next;
        // ⚠ 先寫回 value 再跑驗證（S18a 交接筆記的坑 2：順序反了驗證晚一拍）
        runValidate();
        draw();
        onChange();   // ⚠ 坑 3：onChange 會一併更新輸出 pre
      };

      /* ---- 積木：遞迴渲染一個節點，改動一律走 replace(新節點) ---- */
      function renderNode(node, replace, remove, depth) {
        const box = el('div', 'cond-node');
        box.style.marginInlineStart = `${depth ? 14 : 0}px`;

        const head = el('div', 'cond-head');
        const kind = Array.isArray(node) ? node[0] : undefined;
        const sel = el('select', 'cond-kind');
        for (const k of COND_NODES) {
          const op = el('option', '', COND_NODE_LABELS[k]);
          op.value = k;
          if (k === kind) op.selected = true;
          sel.append(op);
        }
        // 換型別＝換成該型別的預設形狀，不試著硬轉（轉錯比重填更難發現）
        sel.addEventListener('change', () => replace(defaultNode(sel.value, node)));
        head.append(sel);
        if (remove) {
          const del = el('button', 'btn-mini del', '−');
          del.title = '刪除這個條件';
          del.addEventListener('click', () => remove());
          head.append(del);
        }
        box.append(head);

        if (kind === 'and' || kind === 'or') {
          const kids = node.slice(1);
          kids.forEach((child, i) => {
            box.append(renderNode(child,
              (next) => replace([kind, ...kids.slice(0, i), next, ...kids.slice(i + 1)]),
              kids.length > 1 ? () => replace([kind, ...kids.filter((_, j) => j !== i)]) : null,
              depth + 1));
          });
          const add = el('button', 'btn-mini', '＋ 加子條件');
          add.addEventListener('click', () => replace([kind, ...kids, defaultNode('stat')]));
          box.append(add);
        } else if (kind === 'not') {
          const child = node[1];
          box.append(renderNode(child, (next) => replace(['not', next]), null, depth + 1));
        } else if (kind === 'stat') {
          const [, pred, op, num] = node;
          box.append(inline([
            pick(PREDICATES, pred, null, (x) => replace(['stat', x, op, num])),
            pick(COND_OPS, op, COND_OP_LABELS, (x) => replace(['stat', pred, x, num])),
            numInput(num, (x) => replace(['stat', pred, op, x])),
          ]));
        } else if (kind === 'has') {
          const [, tier, key] = node;
          box.append(inline([
            pick(COND_TIERS, tier, COND_TIER_LABELS, (x) => replace(['has', x, key])),
            pick(ALL_TRAIT_KEYS, key, TRAIT_KEY_LABELS, (x) => replace(['has', tier, x])),
          ]));
        } else if (kind === 'hasCount') {
          const [, tier, n] = node;
          box.append(inline([
            pick(COND_TIERS, tier, COND_TIER_LABELS, (x) => replace(['hasCount', x, n])),
            numInput(n, (x) => replace(['hasCount', tier, x])),
          ]));
        } else {
          box.append(el('div', 'hint', '無法辨識的節點——切到原始模式檢視'));
        }
        return box;
      }

      function draw() {
        body.textContent = '';
        bar.textContent = '';
        for (const [id, label] of [['blocks', '積木'], ['raw', '原始 JSON']]) {
          const b = el('button', `btn-mini${mode === id ? ' on' : ''}`, label);
          b.addEventListener('click', () => { mode = id; draw(); });
          bar.append(b);
        }

        if (mode === 'raw') {
          const ta = el('textarea');
          ta.rows = 3;
          ta.placeholder = "['and', ['stat', 'age', 'gte', 30], ['has', 'epic', 'prophet']]";
          ta.value = value[f.key] === undefined ? '' : JSON.stringify(value[f.key]);
          ta.addEventListener('input', () => {
            if (errBoxRef) errBoxRef.textContent = '';
            if (ta.value.trim() === '') { delete value[f.key]; onChange(); return; }
            try {
              // ⚠ 先寫回 value 再驗證（坑 2）；不呼叫 draw()，重畫會吃掉輸入焦點
              value[f.key] = JSON.parse(ta.value);
              runValidate();
            } catch (e) {
              errs.push(`JSON 語法錯誤：${e.message}`);
            }
            onChange();
          });
          body.append(ta);
          return;
        }

        const cur = value[f.key];
        if (cur === undefined) {
          const add = el('button', 'btn-mini', '＋ 建立條件式');
          add.addEventListener('click', () => commit(defaultNode('and')));
          body.append(add);
          if (!f.required) {
            const hint = el('div', 'hint', '不寫＝恆真');
            body.append(hint);
          }
          return;
        }
        body.append(renderNode(cur, (next) => commit(next), () => commit(undefined), 0));
      }

      wrap.append(bar, body);
      draw();
      return { node: wrap, onErrors: runValidate };
    }
    case 'effect': {
      // 效果物件：鍵（從 EFFECT_KEYS 選）＋寫法＋值。特別處理訓練卡的特殊子鍵
      const keys = f.fields ? f.fields.map((x) => x.key) : null;
      const wrap = el('div', 'effect-ed');
      const render = () => {
        wrap.textContent = '';
        const map = v && typeof v === 'object' ? v : {};
        const entries = Object.entries(map);
        if (!entries.length) {
          const addBtn = el('button', 'btn-mini', '+ 加一個效果');
          addBtn.addEventListener('click', () => {
            if (f.fields) { value[f.key] = { [f.fields[0].key]: {} }; }
            else { value[f.key] = { [EFFECT_KEYS_LABELS ? firstEffectKey() : '']: { add: 0 } }; }
            onChange();
          });
          wrap.append(addBtn);
          return;
        }
        const addBtn = el('button', 'btn-mini', '+ 加一個效果');
        addBtn.addEventListener('click', () => {
          const blank = f.fields ? { [f.fields[0].key]: {} } : { [firstEffectKey()]: { add: 0 } };
          Object.assign(map, blank);
          onChange();
        });
        wrap.append(addBtn);
        for (const [ekey, evalue] of entries) {
          const row = el('div', 'eff-row');
          if (f.fields) {
            // 訓練卡效果的特殊子鍵
            const sel = el('select');
            for (const o of keys) {
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
    case 'range': {
      // 閉區間 [lo, hi]（訓練卡體力條件）；空＝全體力
      const wrap = el('div', 'eff-row');
      const r = Array.isArray(v) ? v : null;
      const lo = el('input'); lo.type = 'number'; lo.placeholder = 'lo';
      const hi = el('input'); hi.type = 'number'; hi.placeholder = 'hi';
      const commit = () => {
        const a = deserNum(lo.value), b = deserNum(hi.value);
        if (a == null && b == null) set(undefined);
        else set([a ?? 0, b ?? 100]);
      };
      if (r) { lo.value = String(r[0]); hi.value = String(r[1]); }
      lo.addEventListener('input', commit);
      hi.addEventListener('input', commit);
      const rm = el('button', 'btn-mini del', '✕');
      rm.addEventListener('click', () => { set(undefined); onChange(); });
      if (r) wrap.append(el('span', 'dim', '體力'), lo, el('span', 'dim', '~'), hi, rm);
      else {
        const addBtn = el('button', 'btn-mini', '+ 體力條件');
        addBtn.addEventListener('click', () => { value[f.key] = [0, 39]; onChange(); });
        wrap.append(addBtn);
      }
      return { node: wrap, onErrors: () => {} };
    }
    case 'attrMap': {
      // 屬性 → 數值（訓練卡效果 attr，走 investAttr）
      const wrap = el('div', 'effect-ed');
      const m = v && typeof v === 'object' ? v : {};
      const render = () => {
        wrap.textContent = '';
        if (!Object.keys(m).length) {
          const addBtn = el('button', 'btn-mini', '+ 屬性增減');
          addBtn.addEventListener('click', () => { value[f.key] = { tec: 1 }; onChange(); });
          wrap.append(addBtn);
          return;
        }
        for (const k of Object.keys(ATTR_LABELS)) {
          const lab = el('label', 'dim');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.checked = m[k] !== undefined;
          cb.addEventListener('change', () => {
            if (cb.checked) m[k] = 1;
            else delete m[k];
            if (!Object.keys(m).length) set(undefined);
            onChange();
          });
          const num = el('input');
          num.type = 'number';
          num.value = m[k] ?? '';
          num.disabled = m[k] === undefined;
          num.addEventListener('input', () => { m[k] = deserNum(num.value); onChange(); });
          lab.append(cb, el('span', '', ATTR_LABELS[k]), num);
          wrap.append(lab);
        }
        const rm = el('button', 'btn-mini del', '✕ 移除');
        rm.addEventListener('click', () => { set(undefined); onChange(); });
        wrap.append(rm);
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
  // S18b：以下三類原本沒有專屬驗證，測試（tests/kernel/traits.mjs／training.mjs）
  // 擋得住的規則表單全部放行——填的時候綠、貼回去才紅
  if (schemaId === 'trait') validateTrait(value, errors, all);
  if (schemaId === 'fusion') validateFusion(value, errors);
  if (schemaId === 'trainingCard') validateTrainingCard(value, errors);
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

/** 貼回去用的行寬上限——`src/data/*.js` 通篇 100 欄 */
const LINE_WIDTH = 100;

/** 識別字鍵不加引號，其餘照 JS 字面量規則 */
const bareKey = (k) => (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : quote(k));

/**
 * 字串一律單引號。`src/data/*.js` 通篇單引號，`JSON.stringify` 吐出來的雙引號貼回去
 * 雖然能跑，但每一筆的排版都跟鄰居不一樣——違反 S18a「輸出排版與既有檔案一致，
 * 貼回去的 diff 只有新增那幾行」那條不變式（S18b 修）。
 */
function quote(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** 全部攤成一行的形式（用來判斷放不放得下） */
function inlineJsValue(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'function') return v.toString();
  if (Array.isArray(v)) return v.length ? `[${v.map(inlineJsValue).join(', ')}]` : '[]';
  const keys = Object.keys(v);
  return keys.length ? `{ ${keys.map((k) => `${bareKey(k)}: ${inlineJsValue(v[k])}`).join(', ')} }` : '{}';
}

/**
 * 排版與既有資料檔一致：2 空格縮排、單引號、**短的物件與陣列內聯**。
 *
 * 資料檔的寫法是 `effects: { mental: { conf: 3, drive: 3 } }` 一行到底，長到放不下
 * 才換行——所以這裡照同一條線判斷（縮排＋內容 ≤ 100 欄就內聯），而不是無條件展開。
 * 函式（`maintain`）原樣保留。
 */
function formatJsValue(v, indent) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'function') return v.toString();

  const flat = inlineJsValue(v);
  if (!flat.includes('\n') && pad.length + flat.length <= LINE_WIDTH) return flat;

  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => `${padIn}${formatJsValue(x, indent + 1)},`).join('\n')}\n${pad}]`;
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${padIn}${bareKey(k)}: ${formatJsValue(v[k], indent + 1)},`).join('\n')}\n${pad}}`;
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

/* ================= 教學頁籤 ================= */

function renderTutorial() {
  const wrap = el('div', 'tutorial');

  const h = (level, text) => el(`h${level}`, 'tut-h', text);
  const p = (text) => { const n = el('p', 'tut-p'); n.innerHTML = text; return n; };
  const step = (num, title) => el('h3', 'tut-step', `步驟 ${num}：${title}`);
  const note = (text) => el('div', 'tut-note', text);
  const code = (text) => { const n = el('pre', 'tut-code'); n.textContent = text; return n; };
  const field = (name, desc) => {
    const row = el('div', 'tut-field');
    row.append(el('strong', '', name), el('span', '', ` — ${desc}`));
    return row;
  };
  const warn = (text) => el('div', 'tut-warn', `⚠ ${text}`);

  /* ---- 前言 ---- */
  wrap.append(h(2, '新手教學：從零開始建立一個事件和特質'));

  wrap.append(p('這個編輯器是「電競人生」遊戲的內容製作工具。你不需要會寫程式——只要照著表單填資料，就能設計出遊戲中的事件和特質。'));

  wrap.append(h(3, '先搞懂幾個基本概念'));
  wrap.append(p('<strong>事件卡</strong>：遊戲中玩家會遇到的「小事件」。每個月遊戲會隨機抽出一個事件，顯示一段故事文字和幾個選項，玩家選完後根據結果改變角色能力。'));
  wrap.append(p('<strong>特質卡</strong>：角色的隱藏被動能力。比如「抗壓強」會讓比賽更不容易翻車。特質不會主動出現，而是被事件觸發或合成後永久持有。'));
  wrap.append(p('<strong>屬性</strong>：角色的六項基礎能力——體能（vit）、靈巧（agi）、意識（awr）、技巧（tec）、默契（syn）、決斷（dec）。事件的結果可以直接改變屬性值。'));
  wrap.append(p('<strong>旗標（Flag）</strong>：一種標記，打在事件結果上。當事件成功完成並打上旗標，遊戲就會自動給玩家解鎖對應的特質。你可以把旗標想成一個「成就達成」的開關。'));
  wrap.append(p('<strong>效果鍵</strong>：寫在特質上的加成規則。不是直接改屬性，而是改變遊戲中的機制——比如降低受傷機率、增加心理抗壓值等。'));

  wrap.append(h(3, '我們要做的東西'));
  wrap.append(p('<strong>事件卡</strong>「鍛鍊體能」：去健身房遇到一位叫「館長」的教練，他要求你做深蹲。你選擇接受或婉拒。成功了體能（vit）和決斷（dec）上升，失敗了動機和體能下降。'));
  wrap.append(p('<strong>特質卡</strong>「深蹲救台灣」：事件成功觸發旗標後自動解鎖。效果是降低受傷風險，但作為代價會降低紀律（暗示太沉迷深蹲忽略了遊戲練習）。'));
  wrap.append(note('目前遊戲引擎沒有「觸發 N 次後才解鎖特質」的次數計算功能。特質解鎖是透過旗標一次觸發的。如果你想做類似「集滿七次才解鎖」的效果，需要改動遊戲引擎程式——這超出編輯器能做的事。'));

  /* ---- 步驟 1 ---- */
  wrap.append(step(1, '新增事件卡'));
  wrap.append(p('1. 點最上面一排的「事件卡」分頁'));
  wrap.append(p('2. 在「一般事件卡」區域右上角按「+ 新增」'));
  wrap.append(p('3. 左邊列表會多出一個叫 <code>new_event</code> 的按鈕，點它開始編輯'));

  wrap.append(h(4, '填基本資料'));

  wrap.append(field('id', '這張事件卡的英文代號，不能跟已有的重複。改成 <code>squat_challenge</code>。只能用小寫英文、數字和底線。'));
  wrap.append(field('名稱', '玩家在遊戲中看到的事件名字。填「鍛鍊體能」。'));
  wrap.append(field('種類', '這個事件屬於哪一類。選「一般」——因為這是一個日常訓練互動，不是享樂誘惑或戀愛劇情。'));
  wrap.append(field('分類池', '這個事件被抽到時會歸在哪組。你可以理解為「事件的類型分類」。勾選 <strong>persona</strong>（人格類），代表這是跟角色性格和日常互動相關的事件。'));
  wrap.append(field('子標籤', '更細的主題分類。選「生活」。'));
  wrap.append(field('時段標籤', '哪些生涯階段可以遇到這個事件。勾選「常規賽期間」——只有正式賽季中才可能出現。'));
  wrap.append(field('互斥群組', '填 <code>solo_squat_challenge</code>。這個欄位確保同類型事件不會同時出現兩張。<code>solo_</code> 開頭表示它只跟自己互斥。'));
  wrap.append(warn('互斥群組一定要填！不填會導致遊戲出錯。'));

  /* ---- 步驟 2 ---- */
  wrap.append(step(2, '寫故事文字'));
  wrap.append(p('在「敘事文本」欄位填入玩家看到的事件描述。'));
  wrap.append(p('填入：'));
  wrap.append(code('你去健身房遇到館長，他指著深蹲架說：「來，做五組，每組 10 下，重量我決定。」\n你要接受挑戰嗎？'));

  /* ---- 步驟 3 ---- */
  wrap.append(step(3, '設定選項'));
  wrap.append(p('事件至少要有 2 個選項，最多 4 個。每個選項包含：成功率、成功倍率、失敗倍率。'));
  wrap.append(p('「成功基準%」是一個起始機率。實際成功率會被體力和心理抗壓等因素影響——抗壓高的玩家實際成功率會比標示的高。'));
  wrap.append(p('「倍率」控制結果的強弱。設 1 就是正常效果，設 0 就是沒有效果。'));

  wrap.append(h(4, '選項 A：接受挑戰'));
  wrap.append(p('點「+ 加選項」或直接編輯已有的選項。'));
  wrap.append(field('id', '填 <code>a</code>'));
  wrap.append(field('選項文字', '「接受館長的挑戰」'));
  wrap.append(field('成功基準 %', '填 55，代表大約一半多一點的機會成功。'));
  wrap.append(field('成功倍率', '填 1。'));
  wrap.append(field('失敗倍率', '填 1。'));
  wrap.append(field('主推選項', '打勾。遊戲介面會把這個選項顯示得更突出。'));
  wrap.append(field('碰隱藏素質', '打勾。代表這個選項有可能觸發旗標，讓玩家解鎖隱藏特質。'));

  wrap.append(h(4, '選項 B：婉拒挑戰'));
  wrap.append(field('id', '填 <code>b</code>'));
  wrap.append(field('選項文字', '「謝謝館長，我今天做別的」'));
  wrap.append(field('成功基準 %', '填 100。婉拒不會有失敗的風險。'));
  wrap.append(field('成功倍率', '填 0——婉拒不會改變任何屬性。'));
  wrap.append(field('失敗倍率', '填 0。'));

  /* ---- 步驟 4 ---- */
  wrap.append(step(4, '設定成功和失敗的結果'));
  wrap.append(p('每個事件都有兩個結局：好結果（成功時顯示）和壞結果（失敗時顯示）。每個結果包含一段文字、屬性增減、以及可選的旗標。'));

  wrap.append(h(4, '好結果（成功）'));
  wrap.append(p('在「好結果」區域點「+ 編輯結果」。'));
  wrap.append(field('結果敘事', '「你完成了五組深蹲，館長點頭說不錯。」'));
  wrap.append(p('屬性增減——成功時角色的能力會這樣變化：'));
  wrap.append(field('體能（vit）', '在屬性下拉選「體能」，數值填 +2'));
  wrap.append(field('決斷（dec）', '在屬性下拉選「決斷」，數值填 +1'));
  wrap.append(p('旗標——勾選 <strong>grinder（肝帝）</strong>。這個旗標會讓玩家解鎖「肝帝」特質（步驟 6 會詳細說明）。'));

  wrap.append(h(4, '壞結果（失敗）'));
  wrap.append(field('結果敘事', '「第三組就沒力了，館長搖頭走開。」'));
  wrap.append(field('體能（vit）', '在屬性下拉選「體能」，數值填 −1（體力反而因為勉強做重訓而受傷）'));
  wrap.append(p('注意：六屬性只有 vit（體能）、agi（靈巧）、awr（意識）、tec（技巧）、syn（默契）、dec（決斷）。心理維度（動機、自信等）不在這裡改，而是用旗標或特質效果。'));

  wrap.append(step(5, '建立特質卡'));
  wrap.append(p('現在來建立「深蹲救台灣」特質。點最上面一排的「特質卡」分頁，按「+ 新增」。'));

  wrap.append(field('特質鍵', '英文代號，填 <code>squat_savior</code>。不能跟已有特質重複。'));
  wrap.append(field('名稱', '填「深蹲救台灣」。這是玩家在特質清單中看到的名字。'));
  wrap.append(field('種類', '選「common 通用」。通用是最基礎的特質等級，可以直接從事件解鎖。更高的等級（稀有、史詩、傳說）需要透過合成取得。'));
  wrap.append(field('池歸屬', '選 <strong>persona</strong>。池代表這個特質在合成系統中的定位——persona 池的特質可以作為合成稀有特質的材料。'));
  wrap.append(field('益處＋副作用文本', '描述特質效果的遊戲內文字。填：'));
  wrap.append(code('深蹲練出的底盤讓你站得更穩，受傷機率降低。\n但滿腦子都是深蹲，訓練紀律散了。'));

  wrap.append(h(4, '益處（加什麼好處）'));
  wrap.append(p('點「+ 加一個效果」：'));
  wrap.append(field('injuryRate（受傷率封頂）', '下拉選「injuryRate」，寫法選「封頂」，數值填 <code>0.7</code>。意思是：受傷機率最高不會超過原本的 70%，等於直接降低了受傷風險。'));
  wrap.append(p('再加一個：'));
  wrap.append(field('mental_comp（心理·抗壓）', '下拉選「mental_comp」，寫法選「加法」，數值填 <code>3</code>。意思是：抗壓值永久 +3。'));

  wrap.append(h(4, '副作用（加什麼壞處）'));
  wrap.append(note('特質的好處和壞處必須並存——這是這款遊戲的設計原則。沒有壞處的特質不存在。'));
  wrap.append(p('點「+ 加一個效果」：'));
  wrap.append(field('mental_disc（心理·紀律）', '下拉選「mental_disc」，寫法選「加法」，數值填 <code>-3</code>。意思是：紀律值永久 −3。暗示太專注體能訓練，反而忽略了遊戲練習的自律。'));
  wrap.append(field('副作用分級', '選「輕度」——表示這個副作用只是小數值扣減。'));

  /* ---- 步驟 6 ---- */
  wrap.append(step(6, '了解旗標如何解鎖特質'));
  wrap.append(p('還記得步驟 4 中你在好結果勾選了 <strong>grinder</strong> 旗標嗎？'));
  wrap.append(p('旗標的運作方式是這樣的：'));
  wrap.append(p('1. 玩家選了「接受挑戰」→ 判定成功 → 遊戲套用「好結果」'));
  wrap.append(p('2. 好結果上有 grinder 旗標 → 遊戲查詢旗標對應表'));
  wrap.append(p('3. grinder 旗標在遊戲代碼中對應 grinder 特質 → 玩家獲得「肝帝」特質'));
  wrap.append(note('旗標→特質的對應關係寫在遊戲程式 src/engine/eventTrigger.js 的 FLAG_TRAIT 表中。編輯器只能勾選已定義的旗標。如果你想要一個全新的旗標對應到你自訂的特質（例如 squat_savior），需要修改那個程式檔案，加入新的旗標定義。'));

  wrap.append(p('如果你不想改程式，有一種替代做法：'));
  wrap.append(p('1. 在好結果勾選一個已有的旗標（例如 grinder）'));
  wrap.append(p('2. 讓玩家先解鎖該旗標對應的特質'));
  wrap.append(p('3. 在「配方」分頁建立合成配方，讓該特質和其他特质合成你的自訂特質「深蹲救台灣」'));
  wrap.append(p('這樣就能透過合成路徑間接取得自訂特質，不需要改程式。'));

  /* ---- 步驟 7 ---- */
  wrap.append(step(7, '輸出與貼回遊戲'));
  wrap.append(p('填完所有欄位後，編輯器右下方會自動產生一段程式碼。'));
  wrap.append(p('1. 點「複製片段」按鈕'));
  wrap.append(p('2. 打開遊戲資料檔 <code>src/data/events.js</code>，把事件卡代碼貼在 EVENT_CARDS 陣列的最後一個項目之後'));
  wrap.append(p('3. 同理，特質卡代碼貼到 <code>src/data/traits.js</code> 的 BASE_TRAITS 物件中'));
  wrap.append(p('4. 儲存後跑 <code>npm test</code>，確認沒有錯誤'));
  wrap.append(note('如果右下方顯示紅色錯誤訊息，代表某個欄位填錯了——回去檢查那個欄位再回來。'));

  /* ---- 速查表 ---- */
  wrap.append(h(3, '欄位速查表'));

  wrap.append(p('<strong>六屬性（事件的結果可以改變它們）</strong>'));
  wrap.append(code(`vit   體能    agi   靈巧    awr   意識
tec   技巧    syn   默契    dec   決斷`));

  wrap.append(p('<strong>六心理維度（透過特質效果修改）</strong>'));
  wrap.append(code(`comp 抗壓    conf 自信    drive 動機
disc 紀律    trust 信任   resl 韌性`));

  wrap.append(p('<strong>特質階級</strong>'));
  wrap.append(code(`common 通用 → rare 稀有 → epic 史詩 → legend 傳說
事件直接解鎖只能得到通用。更高階需要合成。`));

  wrap.append(p('<strong>事件的結果能做什麼</strong>'));
  wrap.append(code(`好結果／壞結果 各自包含：
  text    結果敘事文字
  attr    屬性增減（例如 vit +2）
  flags   旗標（觸發特質解鎖）`));

  wrap.append(p('<strong>特質的效果鍵能做什麼</strong>'));
  wrap.append(code(`injuryRate       受傷機率（封頂值越低越不容易受傷）
injuryImmune     完全免疫受傷
mental_comp      心理抗壓值
mental_drive     心理動機值
mental_disc      心理紀律值
mental_conf      心理自信值
mental_trust     心理信任值
mental_resl      心理韌性值
peak_age_shift   巔峰期延後幾年
growth_rate_mul  成長速度倍率`));

  wrap.append(warn('注意：特質效果鍵只能改遊戲機制（機率、倍率、心理值），不能直接改六屬性。屬性的增減只能透過事件卡的好壞結果來做。'));

  return wrap;
}

/* ================= 主程式：分頁、列表、表單 ================= */

const TABS = [
  ['event', '事件卡', ['event', 'trainingCard']],
  ['trait', '特質卡', ['trait']],
  ['quest', '任務卡', ['quest']],
  ['fusion', '配方', ['fusion']],
  ['innate', '天生特質', ['innate']],
  ['tutorial', '教學', []],
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
    if (currentTab === 'tutorial') {
      main.append(renderTutorial());
      return;
    }
    const [primary, ...rest] = TABS.find(([t]) => t === currentTab)[2];
    const schemas = rest.length ? [SCHEMAS[primary], SCHEMAS[rest[0]]] : [SCHEMAS[primary]];
    const intro = el('p', 'intro', SCHEMAS[primary].intro);
    main.append(intro);

    // 天生分頁常駐取得率（§1.4 的 0.8 ÷ N）——池開得越大每一個越拿不到，這件事與
    // 直覺相反，所以不能藏在「關係檢查」按鈕後面，要一直看得見
    if (primary === 'innate') {
      for (const issue of checkInnatePoolSize()) {
        main.append(el('p', `banner ${issue.level}`, issue.message));
      }
    }

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
        const display = entry.name || entry.text || String(key);
        const item = el('button', 'item', display);
        item.title = String(key);
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
      return { id: 't_new', tier: 'success', weight: 1, text: '', effects: {} };
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
        outTier: 'rare', out: '', need: [['common', ''], ['common', '']],
      };
    case 'innate':
      return { key: '', mentalBias: null };
    default:
      return {};
  }
}

document.addEventListener('DOMContentLoaded', main);
