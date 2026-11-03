/* ================================================================
   FINANCIAL CALCULATORS — shared logic
   Used by tools/financial-calculators.html (all nine, as tabs) and by
   the nine standalone pages. Each calculator wires itself up only when
   its output element is on the page, so a page that carries one
   calculator never touches another calculator's elements.

   FinCalc.math holds the pure math (no DOM). It is also exported for
   node so the formulas can be checked against independent references.
   Nothing typed into these calculators leaves the browser or is stored.
   ================================================================ */
(function (root) {
  'use strict';

  /* ── Formatting ── */
  var USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var USD0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  /* Turn float dust and negative zero into a clean 0 before display. */
  function tidy(n, places) {
    var eps = 0.5 * Math.pow(10, -(places == null ? 2 : places));
    return Math.abs(n) < eps ? 0 : n;
  }
  function money(n) { return isFinite(n) ? USD.format(tidy(n)) : '—'; }
  function money0(n) { return isFinite(n) ? USD0.format(tidy(n, 0)) : '—'; }
  function pct(n, places) {
    places = places == null ? 2 : places;
    if (!isFinite(n)) return '—';
    return tidy(n, places).toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places }) + '%';
  }
  function num(n, places) {
    if (!isFinite(n)) return '—';
    places = places == null ? 0 : places;
    return tidy(n, places).toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
  }
  function plural(n, word) { return num(n) + ' ' + word + (n === 1 ? '' : 's'); }
  /* 41 -> "3 years 5 months" */
  function duration(months) {
    var y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return plural(m, 'month');
    if (m === 0) return plural(y, 'year');
    return plural(y, 'year') + ' ' + plural(m, 'month');
  }
  function monthLabel(monthsFromNow) {
    var now = new Date();
    /* Day 1 avoids the Jan 31 + 1 month = Mar 3 overflow. */
    var d = new Date(now.getFullYear(), now.getMonth() + monthsFromNow, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  /* ================================================================
     PURE MATH
     ================================================================ */

  /* ── Compound interest ──
     Interest compounds `perYear` times a year. Contributions are monthly,
     so the balance is stepped month by month at the equivalent monthly
     factor g = (1 + r/n)^(n/12). At every compounding date this matches
     compounding the principal exactly; a contribution earns the same
     effective rate from the month it goes in. */
  function compound(o) {
    var r = o.ratePct / 100;
    var n = o.perYear;
    var months = Math.round(o.years * 12);
    var g = r === 0 ? 1 : Math.pow(1 + r / n, n / 12);
    var begin = o.timing === 'begin';
    var bal = o.principal, contrib = 0, rows = [], yearStart = bal, yearContrib = 0;
    for (var m = 1; m <= months; m++) {
      if (begin) { bal += o.monthly; }
      bal *= g;
      if (!begin) { bal += o.monthly; }
      contrib += o.monthly;
      yearContrib += o.monthly;
      if (m % 12 === 0 || m === months) {
        rows.push({
          year: Math.ceil(m / 12), months: m, balance: bal,
          contributions: contrib, interest: bal - yearStart - yearContrib
        });
        yearStart = bal; yearContrib = 0;
      }
    }
    return {
      fv: bal, months: months, contributions: contrib,
      interest: bal - o.principal - contrib,
      effectiveAnnual: (Math.pow(1 + r / n, n) - 1) * 100, rows: rows
    };
  }

  /* ── Loans ── */
  function loanPayment(principal, aprPct, months) {
    var r = aprPct / 1200;
    if (r === 0) return principal / months;
    return principal * r / (1 - Math.pow(1 + r, -months));
  }

  /* One month of interest in whole cents, rounded half up. The APR is held
     in thousandths of a percent so balance x rate is an exact integer and
     half-cent ties don't depend on binary rounding. */
  function monthlyInterestCents(balanceCents, aprPct) {
    return Math.round(balanceCents * Math.round(aprPct * 1000) / 1200000);
  }

  /* Cent-exact amortization, the way a lender's schedule works:
     payment rounded to the cent, each month's interest rounded to the
     cent, and the last payment adjusted so the balance ends at $0.
     opts.extra       extra principal every month ($)
     opts.pmiMonthly  PMI charged in a month whose starting balance is
     opts.pmiAbove    above this balance ($) */
  function amortize(principal, aprPct, months, opts) {
    opts = opts || {};
    aprPct = Math.round(aprPct * 1000) / 1000;
    var pay = Math.round(loanPayment(principal, aprPct, months) * 100);
    var extra = Math.round((opts.extra || 0) * 100);
    var pmi = Math.round((opts.pmiMonthly || 0) * 100);
    var pmiAbove = opts.pmiAbove == null ? Infinity : Math.round(opts.pmiAbove * 100);
    var bal = Math.round(principal * 100);
    var rows = [], totalInt = 0, totalPmi = 0, m = 0;
    while (bal > 0 && m < months) {
      m++;
      var interest = monthlyInterestCents(bal, aprPct);
      var pmiNow = bal > pmiAbove ? pmi : 0;
      var principalPart = Math.max(0, pay - interest) + extra;
      if (m === months || principalPart >= bal) principalPart = bal;
      bal -= principalPart;
      totalInt += interest;
      totalPmi += pmiNow;
      rows.push({ month: m, payment: (principalPart + interest) / 100, interest: interest / 100,
        principal: principalPart / 100, pmi: pmiNow / 100, balance: bal / 100 });
    }
    var last = rows[rows.length - 1];
    return {
      payment: pay / 100, months: m, rows: rows,
      totalInterest: totalInt / 100, totalPmi: totalPmi / 100,
      totalPaid: (Math.round(principal * 100) + totalInt) / 100,
      finalPayment: last ? last.payment : 0
    };
  }

  function byYear(rows) {
    var out = [];
    rows.forEach(function (r) {
      var y = Math.ceil(r.month / 12);
      var cur = out[out.length - 1];
      if (!cur || cur.year !== y) { cur = { year: y, principal: 0, interest: 0, pmi: 0, balance: 0 }; out.push(cur); }
      cur.principal += r.principal; cur.interest += r.interest; cur.pmi += r.pmi || 0; cur.balance = r.balance;
    });
    return out;
  }

  /* ── Debt payoff (avalanche / snowball) ──
     The monthly budget is fixed at (sum of minimums + extra). Each month:
     interest accrues on every open balance (APR / 12, to the cent), every
     open debt gets its minimum, and whatever is left (the extra plus the
     minimums of debts already cleared) goes to the target debt, spilling
     to the next one in line if the target is cleared mid-month. */
  function payoff(debts, extra, strategy) {
    var ds = debts.map(function (d, i) {
      return { idx: i, name: d.name || ('Debt ' + (i + 1)), start: Math.round(d.balance * 100),
        bal: Math.round(d.balance * 100), min: Math.round(d.min * 100),
        apr: d.apr, paidMonth: 0, interest: 0 };
    });
    var order = ds.slice().sort(strategy === 'avalanche'
      ? function (a, b) { return (b.apr - a.apr) || (a.start - b.start) || (a.idx - b.idx); }
      : function (a, b) { return (a.start - b.start) || (b.apr - a.apr) || (a.idx - b.idx); });
    var budget = Math.round((extra || 0) * 100);
    ds.forEach(function (d) { budget += d.min; });
    var month = 0, totalInt = 0, cap = 1200;
    function open() { return ds.some(function (d) { return d.bal > 0; }); }
    while (open() && month < cap) {
      month++;
      ds.forEach(function (d) {
        if (d.bal > 0) { var it = monthlyInterestCents(d.bal, d.apr); d.bal += it; d.interest += it; totalInt += it; }
      });
      var left = budget;
      ds.forEach(function (d) {
        if (d.bal > 0) { var p = Math.min(d.min, d.bal, left); d.bal -= p; left -= p; }
      });
      order.forEach(function (d) {
        if (d.bal > 0 && left > 0) { var p = Math.min(left, d.bal); d.bal -= p; left -= p; }
      });
      ds.forEach(function (d) { if (d.bal === 0 && !d.paidMonth) d.paidMonth = month; });
    }
    var capped = open();
    return {
      months: month, capped: capped, totalInterest: totalInt / 100,
      order: order.map(function (d) { return { name: d.name, month: d.paidMonth, interest: d.interest / 100 }; })
    };
  }

  /* ── Savings goal ── end-of-month deposits, monthly compounding at APR/12. */
  function savingsGoal(o) {
    var i = o.ratePct / 1200, m = Math.round(o.years * 12);
    var grow = Math.pow(1 + i, m);
    var startFv = o.start * grow;
    var need = o.target - startFv;
    var pmt = need <= 0 ? 0 : (i === 0 ? need / m : need * i / (grow - 1));
    var contributed = o.start + pmt * m;
    return { months: m, monthly: pmt, startFv: startFv, contributed: contributed,
      interest: Math.max(o.target, startFv) - contributed, reachedByStart: need <= 0 };
  }
  function savingsFinal(o) {
    var i = o.ratePct / 1200, m = Math.round(o.years * 12);
    var grow = Math.pow(1 + i, m);
    var fv = o.start * grow + (i === 0 ? o.monthly * m : o.monthly * (grow - 1) / i);
    var contributed = o.start + o.monthly * m;
    return { months: m, fv: fv, contributed: contributed, interest: fv - contributed };
  }

  /* ── ROI and CAGR ── */
  function roi(o) {
    return {
      gain: o.final - o.initial,
      roi: (o.final - o.initial) / o.initial * 100,
      cagr: (Math.pow(o.final / o.initial, 1 / o.years) - 1) * 100,
      multiple: o.final / o.initial
    };
  }

  /* ── US federal self-employment + income tax, tax year 2026 ──
     Sources (checked November 2026):
       Brackets, standard deduction, §199A thresholds: IRS Rev. Proc. 2025-32
         (Oct 9, 2025), sections 4.01, 4.14 and 4.26.
       Social Security wage base $184,500: SSA 2026 COLA announcement (Oct 24, 2025).
       SE tax 12.4% + 2.9% on 92.35% of net earnings, $400 floor: IRC §1401-1402,
         Schedule SE. Additional Medicare 0.9% over $200k / $250k MFJ / $125k MFS
         (not indexed): IRC §1401(b)(2).
       QBI deduction: 26 U.S.C. §199A as amended by Pub. L. 119-21 (OBBBA):
         permanent, phase-in range $75,000 ($150,000 joint), $400 minimum when
         QBI from active businesses is at least $1,000.
     Brackets are [upper bound of taxable income, rate]. */
  var TAX2026 = {
    year: 2026,
    brackets: {
      single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
      mfj:    [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
      hoh:    [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
      mfs:    [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]]
    },
    standardDeduction: { single: 16100, mfj: 32200, hoh: 24150, mfs: 16100 },
    ssWageBase: 184500,
    addlMedicareThreshold: { single: 200000, mfj: 250000, hoh: 200000, mfs: 125000 },
    qbiThreshold: { single: 201750, mfj: 403500, hoh: 201750, mfs: 201775 },
    qbiPhaseIn: { single: 75000, mfj: 150000, hoh: 75000, mfs: 75000 }
  };

  /* Approximate state rates, applied to (AGI - federal standard deduction).
     Flat-tax states: the 2026 flat rate. Graduated states: the average rate a
     single filer pays on $75,000 of state taxable income under the state's
     2026 brackets (so it understates at high incomes and overstates at low).
     Source: Tax Foundation, "State Individual Income Tax Rates and Brackets,
     2026" (rates as of Jan 1, 2026). Users can overwrite the rate. */
  var STATE_RATES_2026 = {
    none: 0, AL: 4.95, AZ: 2.50, AR: 3.78, CA: 4.55, CO: 4.40, CT: 4.50, DE: 5.24, DC: 6.37,
    GA: 5.19, HI: 6.12, ID: 4.96, IL: 4.95, IN: 2.95, IA: 3.80, KS: 5.46, KY: 3.50, LA: 3.00,
    ME: 6.46, MD: 4.68, MA: 5.00, MI: 4.25, MN: 6.16, MS: 3.47, MO: 4.46, MT: 5.05, NE: 4.15,
    NJ: 3.54, NM: 4.18, NY: 5.18, NC: 3.99, ND: 0.69, OH: 1.79, OK: 4.21, OR: 8.32, PA: 3.07,
    RI: 3.75, SC: 5.13, UT: 4.50, VT: 4.46, VA: 5.41, WV: 3.70, WI: 4.50
  };

  function bracketTax(taxable, brackets) {
    var tax = 0, lower = 0, detail = [];
    for (var i = 0; i < brackets.length && taxable > lower; i++) {
      var upper = brackets[i][0], rate = brackets[i][1];
      var slice = Math.min(taxable, upper) - lower;
      tax += slice * rate;
      detail.push({ rate: rate, from: lower, to: upper, taxable: slice, tax: slice * rate });
      lower = upper;
    }
    return { tax: tax, detail: detail };
  }

  /* §199A for a sole proprietor who pays no W-2 wages and holds no
     qualified property, so the wage/property limit is $0. */
  function qbiDeduction(qbi, tiBeforeQbi, status, sstb) {
    if (qbi <= 0 || tiBeforeQbi <= 0) return { amount: 0, phase: 0, minApplied: false };
    var thr = TAX2026.qbiThreshold[status], range = TAX2026.qbiPhaseIn[status];
    var f = Math.min(1, Math.max(0, (tiBeforeQbi - thr) / range));
    var base = 0.20 * qbi, component;
    if (f === 0) component = base;
    else if (f >= 1) component = 0;
    else if (sstb) component = base * (1 - f) * (1 - f); /* applicable % (1-f), then wage-limit phase-in */
    else component = base * (1 - f);                     /* wage-limit phase-in toward $0 */
    var amount = Math.min(component, 0.20 * tiBeforeQbi);
    /* §199A(i): at least $400 if QBI from active businesses is >= $1,000.
       An SSTB counts only its applicable percentage, and none above the range. */
    var activeQbi = sstb ? qbi * (1 - f) : qbi;
    var minApplied = false;
    if (activeQbi >= 1000 && amount < 400) { amount = 400; minApplied = true; }
    return { amount: Math.min(amount, tiBeforeQbi), phase: f, minApplied: minApplied };
  }

  function freelancerTax(o) {
    var T = TAX2026, status = o.status;
    var net = o.gross - o.expenses;
    var seBase = Math.max(0, net) * 0.9235;
    var seApplies = seBase >= 400;
    var ss = seApplies ? 0.124 * Math.min(seBase, T.ssWageBase) : 0;
    var medicare = seApplies ? 0.029 * seBase : 0;
    var seTax = ss + medicare;
    var addlMedicare = seApplies ? 0.009 * Math.max(0, seBase - T.addlMedicareThreshold[status]) : 0;
    var halfSe = seTax / 2;
    var agi = net - halfSe;
    var std = T.standardDeduction[status];
    var tiBeforeQbi = Math.max(0, agi - std);
    var qbiIncome = net - halfSe;
    var q = qbiDeduction(qbiIncome, tiBeforeQbi, status, !!o.sstb);
    var taxable = Math.max(0, tiBeforeQbi - q.amount);
    var fed = bracketTax(taxable, T.brackets[status]);
    var stateTax = Math.max(0, o.stateRatePct || 0) / 100 * tiBeforeQbi;
    var federalTotal = fed.tax + seTax + addlMedicare;
    var total = federalTotal + stateTax;
    var marginal = 0;
    fed.detail.forEach(function (d) { if (d.taxable > 0) marginal = d.rate; });
    return {
      net: net, seBase: seBase, ss: ss, medicare: medicare, seTax: seTax, addlMedicare: addlMedicare,
      halfSe: halfSe, agi: agi, standardDeduction: std, tiBeforeQbi: tiBeforeQbi,
      qbiIncome: qbiIncome, qbi: q, taxable: taxable, incomeTax: fed.tax, brackets: fed.detail,
      marginalRate: marginal * 100, stateTax: stateTax, federalTotal: federalTotal, total: total,
      quarterlyFederal: federalTotal / 4, quarterlyState: stateTax / 4,
      effectiveOnNet: net > 0 ? total / net * 100 : 0, takeHome: net - total
    };
  }

  /* ── FIRE ── everything in today's dollars. */
  function fire(o) {
    var real = (1 + o.returnPct / 100) / (1 + o.inflationPct / 100) - 1;
    var fiNumber = o.expenses / (o.swrPct / 100);
    var g = Math.pow(1 + real, 1 / 12);
    var monthly = o.savings / 12;
    var bal = o.current, rows = [];
    var reachedAt = bal >= fiNumber ? 0 : -1;
    /* Month by month (savings at month end) until the year in which the
       balance first reaches the FI number, capped at 100 years. */
    for (var month = 1; month <= 1200; month++) {
      bal = bal * g + monthly;
      if (reachedAt < 0 && bal >= fiNumber) reachedAt = month;
      if (month % 12 === 0) {
        var y = month / 12;
        rows.push({ year: y, balance: bal, nominal: bal * Math.pow(1 + o.inflationPct / 100, y) });
        if (reachedAt >= 0) break;
      }
    }
    var coast = null;
    if (o.age != null && o.coastAge != null) {
      var yrs = Math.max(0, o.coastAge - o.age);
      coast = fiNumber / Math.pow(1 + real, yrs);
    }
    return {
      realReturnPct: real * 100, fiNumber: fiNumber,
      lean: fiNumber * 0.75, fat: fiNumber * 2,
      monthsToFi: reachedAt, progressPct: Math.min(100, o.current / fiNumber * 100),
      coast: coast, rows: rows
    };
  }

  /* ── Side hustle ── */
  function hustle(o) {
    var fees = o.revenue * o.feePct / 100;
    var profit = o.revenue - fees - o.expenses;
    var tax = Math.max(0, profit) * o.taxPct / 100;
    var net = profit - tax;
    return { fees: fees, profit: profit, tax: tax, net: net, annualNet: net * 12,
      hourlyPreTax: profit / o.hours, hourlyNet: net / o.hours };
  }

  /* ── Crypto DCA (teaching model) ──
     Price follows a straight line from start to end price with two smooth
     swings of +/- swingPct around it. One buy at the start of each period;
     the position is valued at the end price when the period ends. */
  function dca(o) {
    var buys = Math.max(1, Math.floor(o.months * o.perYear / 12 + 1e-9));
    var fee = o.feePct / 100, swing = o.swingPct / 100;
    var coins = 0, spent = 0, rows = [];
    for (var i = 0; i < buys; i++) {
      var t = i / buys;
      var trend = o.startPrice + (o.endPrice - o.startPrice) * t;
      var price = trend * (1 + swing * Math.sin(4 * Math.PI * t));
      var got = o.amount * (1 - fee) / price;
      coins += got; spent += o.amount;
      rows.push({ n: i + 1, price: price, coins: got, totalCoins: coins, spent: spent });
    }
    var value = coins * o.endPrice;
    var lumpCoins = spent * (1 - fee) / o.startPrice;
    var lumpValue = lumpCoins * o.endPrice;
    return {
      buys: buys, spent: spent, coins: coins, avgCost: spent / coins, value: value,
      profit: value - spent, returnPct: (value - spent) / spent * 100,
      lumpCoins: lumpCoins, lumpValue: lumpValue, lumpProfit: lumpValue - spent, rows: rows
    };
  }

  var math = {
    compound: compound, loanPayment: loanPayment, amortize: amortize, byYear: byYear,
    payoff: payoff, savingsGoal: savingsGoal, savingsFinal: savingsFinal, roi: roi,
    TAX2026: TAX2026, STATE_RATES_2026: STATE_RATES_2026, bracketTax: bracketTax,
    qbiDeduction: qbiDeduction, freelancerTax: freelancerTax, fire: fire, hustle: hustle, dca: dca
  };

  var FinCalc = {
    math: math, money: money, money0: money0, pct: pct, num: num, duration: duration,
    monthLabel: monthLabel
  };

  if (typeof module === 'object' && module.exports) module.exports = FinCalc;
  if (typeof document === 'undefined') return;
  root.FinCalc = FinCalc;

  /* ================================================================
     DOM HELPERS
     ================================================================ */
  function $(id) { return document.getElementById(id); }

  function row(label, value, tone) {
    return '<div class="result-row"><span class="result-label">' + label + '</span>' +
      '<span class="result-value' + (tone ? ' result-value--' + tone : '') + '">' + value + '</span></div>';
  }
  function note(text, warn) {
    return '<p class="result-note' + (warn ? ' result-note--warn' : '') + '">' + text + '</p>';
  }
  function table(head, body) {
    return '<table class="growth-table"><thead><tr><th scope="col">' + head.join('</th><th scope="col">') +
      '</th></tr></thead><tbody>' + body.map(function (cells) {
        return '<tr><td>' + cells.join('</td><td>') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* Inline, per-field error messages. */
  function setFieldError(input, msg) {
    var id = (input.id || '') + '-err';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('span');
      el.className = 'field-error';
      el.id = id;
      el.setAttribute('role', 'alert');
      input.parentNode.appendChild(el);
    }
    el.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    var described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (described.indexOf(id) < 0) { described.push(id); input.setAttribute('aria-describedby', described.join(' ')); }
  }
  function clearFieldError(input) {
    var id = (input.id || '') + '-err';
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
    input.removeAttribute('aria-invalid');
    var described = (input.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== id; });
    if (described.length) input.setAttribute('aria-describedby', described.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  /* Read and validate one numeric input.
     spec: { min, max, gt (exclusive min), optional, def, int, msg } */
  function readNumber(input, spec, quiet, errors) {
    var raw = input.value.trim();
    var v = raw === '' ? NaN : Number(raw);
    var ok = true, msg = spec.msg;
    /* A number field holding text the browser can't parse reports '' plus badInput. */
    var garbled = input.validity && input.validity.badInput;
    if (raw === '' && !garbled && (spec.optional || spec.def != null)) {
      clearFieldError(input);
      return spec.def != null ? spec.def : null;
    }
    if (!isFinite(v)) { ok = false; msg = garbled ? 'Enter a number.' : (msg || 'Enter a number.'); }
    else if (spec.gt != null && !(v > spec.gt)) { ok = false; }
    else if (spec.min != null && v < spec.min) { ok = false; }
    else if (spec.max != null && v > spec.max) { ok = false; }
    else if (spec.int && Math.floor(v) !== v) { ok = false; msg = 'Use a whole number.'; }
    if (ok) { clearFieldError(input); return v; }
    if (!msg) {
      if (spec.gt != null && spec.max != null) msg = 'Enter more than ' + num(spec.gt) + ', up to ' + num(spec.max) + '.';
      else if (spec.gt != null) msg = 'Enter a number above ' + num(spec.gt) + '.';
      else if (spec.max != null) msg = 'Enter ' + num(spec.min) + ' to ' + num(spec.max) + '.';
      else msg = 'Enter ' + num(spec.min) + ' or more.';
    }
    errors.push(input);
    if (!quiet) setFieldError(input, msg);
    return null;
  }

  function readFields(specs, quiet) {
    var out = {}, errors = [];
    Object.keys(specs).forEach(function (id) {
      var input = $(id), spec = specs[id];
      out[spec.key || id] = input ? readNumber(input, spec, quiet, errors) : (spec.def != null ? spec.def : null);
    });
    return errors.length ? null : out;
  }

  function showPanelError(id, msg) { var el = $(id); if (el) { el.textContent = msg; el.classList.add('visible'); } }
  function hidePanelError(id) { var el = $(id); if (el) { el.textContent = ''; el.classList.remove('visible'); } }

  function showResults(id) { var el = $(id); el.classList.add('visible'); el.classList.remove('is-stale'); }
  function failResults(id, quiet) {
    var el = $(id);
    if (!el) return false;
    if (quiet) el.classList.add('is-stale');
    else el.classList.remove('visible', 'is-stale');
    return false;
  }

  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }

  /* Wire a calculator panel: live (quiet) updates while typing, full
     validation on change / Enter / button, and a reset to the defaults. */
  function wire(scope, run, onReset) {
    var defaults = [];
    scope.querySelectorAll('input, select').forEach(function (el) {
      defaults.push({ el: el, value: el.value, checked: el.checked });
    });
    var quietRun = debounce(function () { run(true); }, 220);
    scope.addEventListener('input', function (e) {
      if (e.target.matches('input, select')) quietRun();
    });
    scope.addEventListener('change', function (e) {
      if (e.target.matches('input, select')) run(false);
    });
    scope.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); run(false); }
    });
    scope.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-fc-action]');
      if (!btn || !scope.contains(btn)) return;
      var action = btn.getAttribute('data-fc-action');
      if (action === 'calc') run(false);
      if (action === 'reset') {
        if (onReset) onReset();
        defaults.forEach(function (d) {
          if (!document.body.contains(d.el)) return;
          if (d.el.type === 'checkbox' || d.el.type === 'radio') d.el.checked = d.checked;
          else d.el.value = d.value;
        });
        scope.querySelectorAll('[aria-invalid="true"]').forEach(clearFieldError);
        run(false);
      }
    });
    run(true);
  }

  /* ── Hub tabs (financial-calculators.html only) ── */
  function initTabs() {
    var list = document.querySelector('.calc-tabs[role="tablist"]');
    if (!list) return;
    var tabs = Array.prototype.slice.call(list.querySelectorAll('.calc-tab'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = $(t.getAttribute('aria-controls'));
        if (panel) { panel.classList.toggle('active', on); panel.hidden = !on; }
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    select(tabs.filter(function (t) { return t.classList.contains('active'); })[0] || tabs[0], false);
  }

  /* ================================================================
     1. COMPOUND INTEREST
     ================================================================ */
  function initCompound() {
    if (!$('ci-output')) return;
    function run(quiet) {
      hidePanelError('ci-error');
      var v = readFields({
        'ci-principal': { key: 'principal', min: 0, max: 1e12, def: 0 },
        'ci-rate': { key: 'ratePct', min: 0, max: 100, msg: 'Enter a rate from 0 to 100%.' },
        'ci-time': { key: 'years', gt: 0, max: 100, msg: 'Enter 1 month (0.08) to 100 years.' },
        'ci-contrib': { key: 'monthly', min: 0, max: 1e9, def: 0 }
      }, quiet);
      if (v && Math.round(v.years * 12) < 1) {
        if (!quiet) setFieldError($('ci-time'), 'Enter at least one month (0.08 years).');
        v = null;
      }
      if (!v) return failResults('ci-results', quiet);
      v.perYear = Number($('ci-freq').value);
      v.timing = $('ci-timing') ? $('ci-timing').value : 'end';
      var c = math.compound(v);
      var html = row('Future value', money(c.fv), 'teal') +
        row('Starting principal', money(v.principal)) +
        row('Total contributions', money(c.contributions)) +
        row('Total interest earned', money(c.interest), 'violet') +
        row('Effective annual rate', pct(c.effectiveAnnual, 3), 'amber') +
        row('Time', duration(c.months));
      $('ci-output').innerHTML = html;
      $('ci-table-wrap').innerHTML = table(['Year', 'Balance', 'Contributions to date', 'Interest that year'],
        c.rows.map(function (r) {
          return [r.months % 12 ? r.year + ' (' + (r.months % 12) + ' mo)' : r.year, money(r.balance), money(r.contributions), money(r.interest)];
        }));
      showResults('ci-results');
      return true;
    }
    wire($('panel-compound'), run);
  }

  /* ================================================================
     2. LOAN (hub panel — the dedicated page has the full mortgage tool)
     ================================================================ */
  function initLoan() {
    if (!$('ln-output')) return;
    function run(quiet) {
      hidePanelError('ln-error');
      var v = readFields({
        'ln-amount': { key: 'amount', gt: 0, max: 1e8, msg: 'Enter a loan amount above $0, up to $100 million.' },
        'ln-rate': { key: 'rate', min: 0, max: 100, msg: 'Enter a rate from 0 to 100%.' },
        'ln-term': { key: 'years', gt: 0, max: 50, msg: 'Enter a term up to 50 years.' }
      }, quiet);
      if (!v) return failResults('ln-results', quiet);
      var months = Math.max(1, Math.round(v.years * 12));
      var a = math.amortize(v.amount, v.rate, months);
      var html = row('Monthly payment', money(a.payment), 'teal') +
        row('Number of payments', plural(months, 'payment'));
      if (Math.abs(a.finalPayment - a.payment) >= 0.01) html += row('Final payment (adjusted to clear the balance)', money(a.finalPayment));
      html += row('Total interest', money(a.totalInterest), 'rose') +
        row('Total paid', money(a.totalPaid)) +
        row('Interest as a share of the loan', pct(a.totalInterest / v.amount * 100), 'amber');
      $('ln-output').innerHTML = html;
      $('ln-table-wrap').innerHTML = table(['Year', 'Principal paid', 'Interest paid', 'Balance left'],
        math.byYear(a.rows).map(function (y) { return [y.year, money(y.principal), money(y.interest), money(y.balance)]; }));
      showResults('ln-results');
      return true;
    }
    wire($('panel-loan'), run);
  }

  /* ================================================================
     3. DEBT PAYOFF
     ================================================================ */
  var MAX_DEBTS = 10;
  function debtRowHtml(n, vals) {
    vals = vals || {};
    function field(cls, idp, label, value, ph) {
      return '<div class="form-group"><label for="' + idp + n + '">' + label + '</label>' +
        '<input type="number" id="' + idp + n + '" class="' + cls + '" min="0" step="any" placeholder="' + ph + '"' +
        (value != null ? ' value="' + value + '"' : '') + '></div>';
    }
    return '<span class="debt-row__title">Debt ' + n + '</span>' +
      field('debt-balance', 'debt-bal-', 'Balance ($)', vals.balance, '5000') +
      field('debt-rate', 'debt-apr-', 'APR (%)', vals.apr, '18') +
      field('debt-payment', 'debt-min-', 'Minimum ($/month)', vals.min, '150') +
      '<div class="debt-row__remove"><button type="button" class="remove-debt" aria-label="Remove debt ' + n + '">&times;</button></div>';
  }

  function renumberDebts(container) {
    var rows = container.querySelectorAll('.debt-row');
    rows.forEach(function (rowEl, i) {
      var n = i + 1;
      rowEl.setAttribute('aria-label', 'Debt ' + n);
      rowEl.querySelector('.debt-row__title').textContent = 'Debt ' + n;
      [['.debt-balance', 'debt-bal-'], ['.debt-rate', 'debt-apr-'], ['.debt-payment', 'debt-min-']].forEach(function (p) {
        var input = rowEl.querySelector(p[0]);
        var wasInvalid = input.getAttribute('aria-invalid') === 'true';
        clearFieldError(input);
        input.id = p[1] + n;
        input.parentNode.querySelector('label').setAttribute('for', p[1] + n);
        if (wasInvalid) input.setAttribute('aria-invalid', 'true');
      });
      var rm = rowEl.querySelector('.remove-debt');
      rm.setAttribute('aria-label', 'Remove debt ' + n);
      rm.disabled = rows.length <= 1;
    });
    var add = document.querySelector('[data-fc-action="add-debt"]');
    if (add) add.disabled = rows.length >= MAX_DEBTS;
  }

  function initDebt() {
    var container = $('debt-rows');
    if (!container || !$('debt-output')) return;
    var initialRows = container.innerHTML;
    renumberDebts(container);

    function run(quiet) {
      hidePanelError('debt-error');
      var debts = [], bad = false;
      container.querySelectorAll('.debt-row').forEach(function (rowEl, i) {
        var bi = rowEl.querySelector('.debt-balance'), ri = rowEl.querySelector('.debt-rate'), pi = rowEl.querySelector('.debt-payment');
        if (bi.value.trim() === '' && ri.value.trim() === '' && pi.value.trim() === '') {
          [bi, ri, pi].forEach(clearFieldError);
          return; /* a blank row is ignored */
        }
        var errs = [];
        var bal = readNumber(bi, { gt: 0, max: 1e8, msg: 'Enter a balance above $0, up to $100 million.' }, quiet, errs);
        var apr = readNumber(ri, { min: 0, max: 100, msg: 'Enter an APR from 0 to 100%.' }, quiet, errs);
        var min = readNumber(pi, { gt: 0, max: 1e9, msg: 'Enter a monthly minimum above $0.' }, quiet, errs);
        if (errs.length) { bad = true; return; }
        debts.push({ name: 'Debt ' + (i + 1), balance: bal, apr: apr, min: min });
      });
      var extraErrs = [];
      var extra = readNumber($('debt-extra'), { min: 0, max: 1e9, def: 0 }, quiet, extraErrs);
      if (bad || extraErrs.length) return failResults('debt-results', quiet);
      if (!debts.length) {
        if (!quiet) showPanelError('debt-error', 'Add at least one debt.');
        return failResults('debt-results', quiet);
      }
      var firstInterest = 0, budget = extra, underwater = [];
      debts.forEach(function (d) {
        var it = d.balance * d.apr / 1200;
        firstInterest += it; budget += d.min;
        if (d.min <= it) underwater.push(d.name);
      });
      if (budget <= firstInterest) {
        if (!quiet) showPanelError('debt-error', 'Your total monthly payment (' + money(budget) + ') does not cover the monthly interest (' + money(firstInterest) + '), so the balance would never shrink. Raise a minimum or add an extra payment.');
        return failResults('debt-results', quiet);
      }

      var av = math.payoff(debts, extra, 'avalanche');
      var sn = math.payoff(debts, extra, 'snowball');
      var total = debts.reduce(function (s, d) { return s + d.balance; }, 0);

      function plan(p) {
        if (p.capped) return row('Payoff time', 'Over 100 years', 'rose');
        return row('Payoff time', duration(p.months) + ' (' + monthLabel(p.months) + ')', 'teal') +
          row('Total interest', money(p.totalInterest), 'rose') +
          row('Total paid', money(total + p.totalInterest));
      }
      function order(p) {
        var cleared = p.order.slice().sort(function (a, b) { return (a.month || 1e9) - (b.month || 1e9); });
        return '<ol class="payoff-order" aria-label="Order the debts are paid off">' + cleared.map(function (d) {
          return '<li>' + d.name + (d.month ? ' paid off in month ' + d.month + ' (' + monthLabel(d.month) + ')' : ' not paid off within 100 years') + '</li>';
        }).join('') + '</ol>';
      }

      var html = row('Total debt', money(total)) + row('Monthly budget (minimums + extra)', money(budget), 'violet');
      if (debts.length === 1) {
        html += plan(av);
      } else {
        html += '<p class="calc-subhead">Avalanche &mdash; highest APR first</p>' + plan(av) + order(av) +
          '<p class="calc-subhead">Snowball &mdash; smallest balance first</p>' + plan(sn) + order(sn);
        var saved = sn.totalInterest - av.totalInterest;
        var faster = sn.months - av.months;
        html += '<p class="calc-subhead">Comparison</p>';
        if (Math.abs(saved) < 0.01 && faster === 0) {
          html += note('Both orders give the same result here, usually because the smallest balance also carries the highest APR.');
        } else {
          html += row('Interest avalanche saves vs snowball', money(saved), saved >= 0 ? 'teal' : 'rose') +
            row('Months avalanche saves vs snowball', num(faster), faster >= 0 ? 'teal' : 'rose');
        }
      }
      if (underwater.length) {
        html += note(underwater.join(', ') + (underwater.length > 1 ? ' have minimums' : ' has a minimum') +
          ' at or below the monthly interest, so on its own it would never shrink. The plan clears it once the rest of the budget reaches it.', true);
      }
      $('debt-output').innerHTML = html;
      showResults('debt-results');
      return true;
    }

    var panel = $('panel-debt');
    panel.addEventListener('click', function (e) {
      var add = e.target.closest('[data-fc-action="add-debt"]');
      var rm = e.target.closest('.remove-debt');
      if (add) {
        var rows = container.querySelectorAll('.debt-row');
        if (rows.length >= MAX_DEBTS) return;
        var div = document.createElement('div');
        div.className = 'debt-row';
        div.setAttribute('role', 'group');
        div.innerHTML = debtRowHtml(rows.length + 1);
        container.appendChild(div);
        renumberDebts(container);
        div.querySelector('input').focus();
      } else if (rm) {
        if (container.querySelectorAll('.debt-row').length <= 1) return;
        var rowEl = rm.closest('.debt-row');
        var next = rowEl.nextElementSibling || rowEl.previousElementSibling;
        rowEl.parentNode.removeChild(rowEl);
        renumberDebts(container);
        if (next) next.querySelector('input').focus();
        run(true);
      }
    });
    wire(panel, run, function () { container.innerHTML = initialRows; renumberDebts(container); });
  }

  /* ================================================================
     4. SAVINGS GOAL
     ================================================================ */
  function initSavings() {
    if (!$('sav-output')) return;
    var mode = 'goal';
    var toggle = $('sav-mode-toggle');
    function setMode(m) {
      mode = m;
      toggle.querySelectorAll('button').forEach(function (b) {
        var on = b.getAttribute('data-mode') === m;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('sav-target-group').hidden = m !== 'goal';
      $('sav-contrib-group').hidden = m === 'goal';
    }
    toggle.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (b) { setMode(b.getAttribute('data-mode')); run(false); }
    });

    function run(quiet) {
      hidePanelError('sav-error');
      var specs = {
        'sav-start': { key: 'start', min: 0, max: 1e12, def: 0 },
        'sav-time': { key: 'years', gt: 0, max: 100, msg: 'Enter 1 month (0.08) to 100 years.' },
        'sav-rate': { key: 'ratePct', min: 0, max: 100, msg: 'Enter a return from 0 to 100%.' }
      };
      if (mode === 'goal') specs['sav-target'] = { key: 'target', gt: 0, max: 1e12, msg: 'Enter a target above $0.' };
      else specs['sav-contrib'] = { key: 'monthly', min: 0, max: 1e9, msg: 'Enter $0 or more per month.' };
      var v = readFields(specs, quiet);
      if (v && Math.round(v.years * 12) < 1) {
        if (!quiet) setFieldError($('sav-time'), 'Enter at least one month (0.08 years).');
        v = null;
      }
      if (!v) return failResults('sav-results', quiet);
      var html = '';
      if (mode === 'goal') {
        var g = math.savingsGoal(v);
        if (g.reachedByStart) {
          html += row('Required monthly contribution', money(0), 'teal') +
            row('Your savings grow to', money(g.startFv), 'violet') +
            note('What you have already saved reaches the target on its own in this time at this return.');
        } else {
          html += row('Required monthly contribution', money(g.monthly), 'teal') +
            row('Target', money(v.target)) +
            row('You put in (incl. starting amount)', money(g.contributed)) +
            row('Growth earned', money(g.interest), 'violet') +
            row('Months of saving', num(g.months));
        }
      } else {
        var f = math.savingsFinal(v);
        html += row('Final amount', money(f.fv), 'teal') +
          row('You put in (incl. starting amount)', money(f.contributed)) +
          row('Growth earned', money(f.interest), 'violet') +
          row('Months of saving', num(f.months));
      }
      $('sav-output').innerHTML = html;
      showResults('sav-results');
      return true;
    }
    setMode('goal');
    wire($('panel-savings'), run, function () { setMode('goal'); });
  }

  /* ================================================================
     5. ROI
     ================================================================ */
  function initRoi() {
    if (!$('roi-output')) return;
    function run(quiet) {
      hidePanelError('roi-error');
      var v = readFields({
        'roi-initial': { key: 'initial', gt: 0, max: 1e12, msg: 'Enter an amount above $0.' },
        'roi-final': { key: 'final', min: 0, max: 1e15, msg: 'Enter $0 or more.' },
        'roi-years': { key: 'years', gt: 0, max: 200, msg: 'Enter a period above 0, up to 200 years.' }
      }, quiet);
      if (!v) return failResults('roi-results', quiet);
      var r = math.roi(v);
      var html = row('Total return (ROI)', (r.roi > 0 ? '+' : '') + pct(r.roi), r.roi >= 0 ? 'teal' : 'rose') +
        row('Annualized return (CAGR)', (r.cagr > 0 ? '+' : '') + pct(r.cagr), r.cagr >= 0 ? 'violet' : 'rose') +
        row('Gain or loss', money(r.gain), r.gain >= 0 ? 'teal' : 'rose') +
        row('Growth multiple', num(r.multiple, 2) + '×') +
        row('Time period', num(v.years, v.years % 1 ? 2 : 0) + (v.years === 1 ? ' year' : ' years'));
      if (v.years < 1) html += note('Annualizing a period shorter than a year scales the result up as if it repeated all year. Treat the CAGR with care.', true);
      $('roi-output').innerHTML = html;
      showResults('roi-results');
      return true;
    }
    wire($('panel-roi'), run);
  }

  /* ================================================================
     6. FREELANCER TAX (US federal, tax year 2026)
     ================================================================ */
  function initTax() {
    if (!$('tax-output')) return;
    var stateSel = $('tax-state'), rateInput = $('tax-state-rate');
    if (stateSel && rateInput) {
      stateSel.addEventListener('change', function () {
        var r = STATE_RATES_2026[stateSel.value];
        rateInput.value = r == null ? 0 : r;
      });
    }
    var LABEL = { single: 'single', mfj: 'married filing jointly', hoh: 'head of household', mfs: 'married filing separately' };
    function run(quiet) {
      hidePanelError('tax-error');
      var v = readFields({
        'tax-income': { key: 'gross', min: 0, max: 1e10, msg: 'Enter $0 or more.' },
        'tax-expenses': { key: 'expenses', min: 0, max: 1e10, def: 0 },
        'tax-state-rate': { key: 'stateRatePct', min: 0, max: 20, def: 0, msg: 'Enter 0 to 20%.' }
      }, quiet);
      if (!v) return failResults('tax-results', quiet);
      v.status = $('tax-status').value;
      v.sstb = $('tax-sstb') ? $('tax-sstb').checked : false;
      var t = math.freelancerTax(v);
      var html = row('Net profit (income minus expenses)', money(t.net));
      if (t.net <= 0) {
        html += row('Estimated tax', money(0), 'teal') +
          note('With no profit there is no self-employment or income tax on this work. A loss can offset other income on your return.');
        $('tax-output').innerHTML = html;
        $('tax-brackets').innerHTML = '';
        showResults('tax-results');
        return true;
      }
      html += row('Self-employment tax (15.3% of 92.35% of profit)', money(t.seTax), 'amber');
      if (t.addlMedicare > 0) html += row('Additional Medicare tax (0.9%)', money(t.addlMedicare), 'amber');
      html += row('Adjusted gross income (profit minus half of SE tax)', money(t.agi)) +
        row('Standard deduction (' + LABEL[v.status] + ')', money(t.standardDeduction)) +
        row('QBI deduction' + (t.qbi.minApplied ? ' ($400 minimum)' : t.qbi.phase > 0 ? (t.qbi.phase >= 1 ? ' (fully phased out)' : ' (partly phased out)') : ''), money(t.qbi.amount)) +
        row('Federal taxable income', money(t.taxable)) +
        row('Federal income tax', money(t.incomeTax), 'violet') +
        row('Top federal bracket reached', pct(t.marginalRate, 0));
      if (t.stateTax > 0) html += row('State income tax (approx., ' + pct(v.stateRatePct) + ')', money(t.stateTax), 'rose');
      html += '<p class="calc-subhead">Totals</p>' +
        row('Total estimated tax', money(t.total), 'rose') +
        row('Share of net profit', pct(t.effectiveOnNet), 'amber') +
        row('Federal quarterly payment (1040-ES, ×4)', money(t.quarterlyFederal), 'teal');
      if (t.stateTax > 0) html += row('State quarterly payment (approx., ×4)', money(t.quarterlyState), 'teal');
      html += row('Estimated take-home after tax', money(t.takeHome), 'teal');
      if (t.seBase < 400) html += note('Net self-employment earnings under $400 owe no self-employment tax.');
      $('tax-output').innerHTML = html;
      $('tax-brackets').innerHTML = t.brackets.length ? table(['Rate', 'Taxable income band', 'Income in band', 'Tax'],
        t.brackets.map(function (b) {
          return [pct(b.rate * 100, 0), money0(b.from) + ' – ' + (b.to === Infinity ? 'and up' : money0(b.to)), money(b.taxable), money(b.tax)];
        })) : note('No federal taxable income after deductions.');
      showResults('tax-results');
      return true;
    }
    wire($('panel-tax'), run);
  }

  /* ================================================================
     7. FIRE
     ================================================================ */
  function initFire() {
    if (!$('fire-output')) return;
    function run(quiet) {
      hidePanelError('fire-error');
      var v = readFields({
        'fire-expenses': { key: 'expenses', gt: 0, max: 1e9, msg: 'Enter yearly spending above $0.' },
        'fire-rate': { key: 'swrPct', gt: 0, max: 20, msg: 'Enter a withdrawal rate above 0, up to 20%.' },
        'fire-current': { key: 'current', min: 0, max: 1e12, def: 0 },
        'fire-contrib': { key: 'savings', min: 0, max: 1e10, def: 0 },
        'fire-return': { key: 'returnPct', min: -50, max: 50, msg: 'Enter a return from -50% to 50%.' },
        'fire-inflation': { key: 'inflationPct', min: -10, max: 30, def: 0, msg: 'Enter inflation from -10% to 30%.' },
        'fire-age': { key: 'age', min: 0, max: 120, optional: true, msg: 'Enter an age from 0 to 120.' },
        'fire-coast-age': { key: 'coastAge', min: 0, max: 120, def: 65, msg: 'Enter an age from 0 to 120.' }
      }, quiet);
      if (!v) return failResults('fire-results', quiet);
      var f = math.fire(v);
      var html = row('FI number (' + pct(v.swrPct, v.swrPct % 1 ? 2 : 0) + ' withdrawal rate)', money0(f.fiNumber), 'teal') +
        row('Lean FI (spending 75% of that)', money0(f.lean), 'amber') +
        row('Fat FI (spending twice that)', money0(f.fat), 'violet');
      if (f.coast != null) {
        html += row('Coast FI: invested today to reach FI by age ' + num(v.coastAge) + ' with no more saving', money0(f.coast), 'rose');
      }
      html += row('Progress toward FI number', pct(f.progressPct, 1), 'teal') +
        row('Real return used (after inflation)', pct(f.realReturnPct), 'amber');
      if (f.monthsToFi === 0) {
        html += row('Time to FI', 'Already there', 'teal');
      } else if (f.monthsToFi > 0) {
        html += row('Time to FI', duration(f.monthsToFi), 'teal');
        if (v.age != null) html += row('Age at FI', num(v.age + f.monthsToFi / 12, 1), 'teal');
      } else {
        html += row('Time to FI', 'Not within 100 years at these numbers', 'rose');
      }
      $('fire-output').innerHTML = html;
      $('fire-table-wrap').innerHTML = f.rows.length ? table(
        v.age != null ? ['Year', 'Age', "Balance (today's $)", 'Balance (future $)'] : ['Year', "Balance (today's $)", 'Balance (future $)'],
        f.rows.map(function (r) {
          var cells = [r.year];
          if (v.age != null) cells.push(num(v.age + r.year));
          cells.push(money0(r.balance), money0(r.nominal));
          return cells;
        })) : '';
      showResults('fire-results');
      return true;
    }
    wire($('panel-fire'), run);
  }

  /* ================================================================
     8. SIDE HUSTLE
     ================================================================ */
  function initHustle() {
    if (!$('hustle-output')) return;
    function run(quiet) {
      hidePanelError('hustle-error');
      var v = readFields({
        'hustle-revenue': { key: 'revenue', min: 0, max: 1e10, msg: 'Enter $0 or more.' },
        'hustle-expenses': { key: 'expenses', min: 0, max: 1e10, def: 0 },
        'hustle-fees': { key: 'feePct', min: 0, max: 100, def: 0, msg: 'Enter 0 to 100%.' },
        'hustle-tax': { key: 'taxPct', min: 0, max: 100, def: 0, msg: 'Enter 0 to 100%.' },
        'hustle-hours': { key: 'hours', gt: 0, max: 744, msg: 'Enter hours above 0 (a month has at most 744).' },
        'hustle-dayjob': { key: 'dayJob', min: 0, max: 1e6, optional: true }
      }, quiet);
      if (!v) return failResults('hustle-results', quiet);
      var h = math.hustle(v);
      var html = row('Revenue (monthly)', money(v.revenue)) +
        row('Platform fees', money(-h.fees), h.fees > 0 ? 'rose' : null) +
        row('Business expenses', money(-v.expenses), v.expenses > 0 ? 'rose' : null) +
        row('Profit before tax', money(h.profit), h.profit >= 0 ? 'teal' : 'rose') +
        row('Tax set aside', money(-h.tax), h.tax > 0 ? 'amber' : null) +
        row('Net profit (monthly)', money(h.net), h.net >= 0 ? 'teal' : 'rose') +
        row('Net profit (yearly)', money(h.annualNet), h.annualNet >= 0 ? 'teal' : 'rose') +
        row('Hourly, before tax', money(h.hourlyPreTax), h.hourlyPreTax >= 0 ? 'violet' : 'rose') +
        row('Hourly, after tax', money(h.hourlyNet), h.hourlyNet >= 0 ? 'teal' : 'rose');
      if (v.dayJob != null && v.dayJob > 0) {
        var delta = h.hourlyPreTax - v.dayJob;
        html += '<p class="calc-subhead">Against your day job (both before tax)</p>' +
          row('Day job pay', money(v.dayJob) + '/hr') +
          row('Side hustle pays ' + (delta >= 0 ? 'more' : 'less') + ' per hour by', money(Math.abs(delta)), delta >= 0 ? 'teal' : 'rose') +
          row('Difference', (delta > 0 ? '+' : '') + pct(delta / v.dayJob * 100, 1), delta >= 0 ? 'teal' : 'rose');
        if (delta < 0) html += note('The side hustle pays less per hour than the day job. That can still be worth it for learning, autonomy, or what it might grow into; the numbers just make the trade visible.', true);
      }
      $('hustle-output').innerHTML = html;
      showResults('hustle-results');
      return true;
    }
    wire($('panel-hustle'), run);
  }

  /* ================================================================
     9. CRYPTO DCA
     ================================================================ */
  function initDca() {
    if (!$('dca-output')) return;
    function coinFmt(n) {
      if (!isFinite(n)) return '—';
      var digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
      return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    function priceFmt(n) { return n < 1 ? '$' + n.toLocaleString('en-US', { maximumSignificantDigits: 4 }) : money(n); }
    function run(quiet) {
      hidePanelError('dca-error');
      var v = readFields({
        'dca-amount': { key: 'amount', gt: 0, max: 1e9, msg: 'Enter an amount above $0.' },
        'dca-duration': { key: 'months', min: 1, max: 600, int: true, msg: 'Enter 1 to 600 months.' },
        'dca-start': { key: 'startPrice', gt: 0, max: 1e9, msg: 'Enter a price above $0.' },
        'dca-end': { key: 'endPrice', gt: 0, max: 1e9, msg: 'Enter a price above $0.' },
        'dca-volatility': { key: 'swingPct', min: 0, max: 90, def: 0, msg: 'Enter a swing from 0 to 90%.' },
        'dca-fee': { key: 'feePct', min: 0, max: 10, def: 0, msg: 'Enter a fee from 0 to 10%.' }
      }, quiet);
      if (!v) return failResults('dca-results', quiet);
      v.perYear = Number($('dca-freq').value);
      var d = math.dca(v);
      var edge = d.profit - d.lumpProfit;
      var html = row('Number of buys', num(d.buys), 'violet') +
        row('Total invested', money(d.spent), 'violet') +
        row('Coins bought', coinFmt(d.coins), 'teal') +
        row('Average cost per coin (incl. fees)', priceFmt(d.avgCost), 'amber') +
        row('Value at the end price', money(d.value), 'teal') +
        row('DCA gain or loss', money(d.profit) + ' (' + (d.returnPct > 0 ? '+' : '') + pct(d.returnPct) + ')', d.profit >= 0 ? 'teal' : 'rose') +
        '<p class="calc-subhead">Lump sum on day one, same total</p>' +
        row('Coins bought', coinFmt(d.lumpCoins)) +
        row('Value at the end price', money(d.lumpValue), 'violet') +
        row('Lump-sum gain or loss', money(d.lumpProfit), d.lumpProfit >= 0 ? 'teal' : 'rose') +
        row('DCA ' + (edge >= 0 ? 'ahead of' : 'behind') + ' lump sum by', money(Math.abs(edge)), edge >= 0 ? 'teal' : 'rose') +
        note(edge >= 0
          ? 'DCA came out ahead on this path: the average buy price ended below the start price, so the dips bought more coins.'
          : 'Lump sum came out ahead on this path: prices mostly sat above the start price, so buying earlier paid off.');
      $('dca-output').innerHTML = html;
      var shown = d.rows.slice(0, 120);
      var body = shown.map(function (r) { return [r.n, priceFmt(r.price), coinFmt(r.coins), coinFmt(r.totalCoins), money(r.spent)]; });
      var tbl = table(['Buy', 'Price', 'Coins bought', 'Coins held', 'Total spent'], body);
      if (d.rows.length > shown.length) tbl += note('Showing the first ' + shown.length + ' of ' + num(d.rows.length) + ' buys.');
      $('dca-table-wrap').innerHTML = tbl;
      showResults('dca-results');
      return true;
    }
    wire($('panel-dca'), run);
  }

  function init() {
    initTabs();
    initCompound();
    initLoan();
    initDebt();
    initSavings();
    initRoi();
    initTax();
    initFire();
    initHustle();
    initDca();
  }
  FinCalc.dom = { row: row, note: note, table: table, readFields: readFields, readNumber: readNumber,
    setFieldError: setFieldError, clearFieldError: clearFieldError, showResults: showResults,
    failResults: failResults, hidePanelError: hidePanelError, showPanelError: showPanelError, wire: wire };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
