  /* ================================================================
     FINANCIAL CALCULATORS — ALL INLINE JS
     ================================================================ */

  /* ── Utility ── */
  function fmt(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    return n.toFixed(2) + '%';
  }
  function getVal(id) {
    var v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? null : v;
  }
  function showError(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('visible');
  }
  function hideError(id) {
    var el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('visible');
  }
  function showResults(id) {
    document.getElementById(id).classList.add('visible');
  }
  function hideResults(id) {
    document.getElementById(id).classList.remove('visible');
  }
  function resultRow(label, value, cls) {
    return '<div class="result-row"><span class="result-label">' + label + '</span><span class="result-value' + (cls ? ' result-value--' + cls : '') + '">$' + fmt(value) + '</span></div>';
  }
  function resultRowText(label, value, cls) {
    return '<div class="result-row"><span class="result-label">' + label + '</span><span class="result-value' + (cls ? ' result-value--' + cls : '') + '">' + value + '</span></div>';
  }

  /* ── Tab switching ── */
  document.querySelectorAll('.calc-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.calc-tab').forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.calc-panel').forEach(function(p) {
        p.classList.remove('active');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  /* ── Clear ── */
  function clearPanel(name) {
    var panel = document.getElementById('panel-' + name);
    panel.querySelectorAll('input[type="number"]').forEach(function(i) { i.value = ''; });
    panel.querySelectorAll('.calc-results').forEach(function(r) { r.classList.remove('visible'); });
    panel.querySelectorAll('.calc-error').forEach(function(e) { e.classList.remove('visible'); e.textContent = ''; });
  }

  /* ================================================================
     1. COMPOUND INTEREST
     ================================================================ */
  function calcCompound() {
    hideError('ci-error');
    hideResults('ci-results');
    var P = getVal('ci-principal');
    var r = getVal('ci-rate');
    var t = getVal('ci-time');
    var n = getVal('ci-freq');
    var c = getVal('ci-contrib') || 0;

    if (P === null || P < 0) { showError('ci-error', 'Enter a valid principal amount.'); return; }
    if (r === null || r < 0) { showError('ci-error', 'Enter a valid annual interest rate.'); return; }
    if (t === null || t <= 0) { showError('ci-error', 'Enter a valid time period greater than 0.'); return; }

    var rate = r / 100;
    var rn = rate / n;
    var nt = n * t;

    /* Future value with contributions:
       FV = P*(1+r/n)^(nt) + c*[((1+r/n)^(nt) - 1) / (r/n)]
       If rate is 0: FV = P + c * 12 * t */
    var fv, totalContrib;
    if (rate === 0) {
      fv = P + c * 12 * t;
    } else {
      var compoundFactor = Math.pow(1 + rn, nt);
      fv = P * compoundFactor;
      /* Monthly contributions: convert to per-period contribution */
      if (c > 0) {
        /* Contributions are monthly; compounding might differ.
           Use the future value of annuity with monthly deposits,
           growing at the effective monthly rate */
        var monthlyRate = rate / 12;
        var totalMonths = t * 12;
        fv = P * Math.pow(1 + monthlyRate, totalMonths) + c * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate);
      }
    }

    totalContrib = c * 12 * t;
    var totalInterest = fv - P - totalContrib;

    var html = '';
    html += resultRow('Future Value', fv, 'teal');
    html += resultRow('Total Contributions', totalContrib);
    html += resultRow('Principal', P);
    html += resultRow('Total Interest Earned', totalInterest, 'violet');
    document.getElementById('ci-output').innerHTML = html;

    /* Growth table year by year */
    var tableHtml = '<table class="growth-table"><thead><tr><th>Year</th><th>Balance</th><th>Contributions</th><th>Interest</th></tr></thead><tbody>';
    var balance = P;
    var monthlyRate2 = (rate === 0) ? 0 : rate / 12;
    var cumulativeContrib = 0;
    for (var y = 1; y <= Math.ceil(t); y++) {
      var months = (y <= t) ? 12 : Math.round((t % 1) * 12);
      if (months === 0 && y > t) break;
      var startBal = balance;
      for (var m = 0; m < months; m++) {
        balance = balance * (1 + monthlyRate2) + c;
        cumulativeContrib += c;
      }
      var yearInterest = balance - startBal - (c * months);
      tableHtml += '<tr><td>' + y + '</td><td>$' + fmt(balance) + '</td><td>$' + fmt(cumulativeContrib) + '</td><td>$' + fmt(yearInterest) + '</td></tr>';
    }
    tableHtml += '</tbody></table>';
    document.getElementById('ci-table-wrap').innerHTML = tableHtml;
    showResults('ci-results');
  }

  /* ================================================================
     2. LOAN / MORTGAGE
     ================================================================ */
  function calcLoan() {
    hideError('ln-error');
    hideResults('ln-results');
    var P = getVal('ln-amount');
    var r = getVal('ln-rate');
    var years = getVal('ln-term');

    if (P === null || P <= 0) { showError('ln-error', 'Enter a valid loan amount.'); return; }
    if (r === null || r < 0) { showError('ln-error', 'Enter a valid interest rate.'); return; }
    if (years === null || years <= 0) { showError('ln-error', 'Enter a valid term in years.'); return; }

    var n = years * 12;
    var monthlyRate = (r / 100) / 12;
    var monthly;

    if (monthlyRate === 0) {
      monthly = P / n;
    } else {
      monthly = P * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
    }

    var totalPaid = monthly * n;
    var totalInterest = totalPaid - P;

    var html = '';
    html += resultRow('Monthly Payment', monthly, 'teal');
    html += resultRow('Total Paid', totalPaid);
    html += resultRow('Total Interest', totalInterest, 'rose');
    html += resultRowText('Loan Amount', '$' + fmt(P));
    html += resultRowText('Interest-to-Principal Ratio', fmtPct((totalInterest / P) * 100), 'amber');
    document.getElementById('ln-output').innerHTML = html;

    /* Amortization summary by year */
    var tableHtml = '<table class="growth-table"><thead><tr><th>Year</th><th>Principal Paid</th><th>Interest Paid</th><th>Remaining Balance</th></tr></thead><tbody>';
    var balance = P;
    for (var y = 1; y <= years; y++) {
      var yearPrincipal = 0;
      var yearInterest2 = 0;
      for (var m = 0; m < 12; m++) {
        if (balance <= 0) break;
        var intPmt = balance * monthlyRate;
        var prinPmt = monthly - intPmt;
        if (prinPmt > balance) prinPmt = balance;
        yearPrincipal += prinPmt;
        yearInterest2 += intPmt;
        balance -= prinPmt;
      }
      if (balance < 0.01) balance = 0;
      tableHtml += '<tr><td>' + y + '</td><td>$' + fmt(yearPrincipal) + '</td><td>$' + fmt(yearInterest2) + '</td><td>$' + fmt(balance) + '</td></tr>';
    }
    tableHtml += '</tbody></table>';
    document.getElementById('ln-table-wrap').innerHTML = tableHtml;
    showResults('ln-results');
  }

  /* ================================================================
     3. DEBT PAYOFF
     ================================================================ */
  var debtIndex = 1;

  function addDebtRow() {
    var container = document.getElementById('debt-rows');
    var div = document.createElement('div');
    div.className = 'debt-row';
    div.dataset.index = debtIndex++;
    div.innerHTML = '<div class="form-group"><label>Balance ($)</label><input type="number" class="debt-balance" placeholder="5000" min="0" step="any"></div>' +
      '<div class="form-group"><label>Rate (%)</label><input type="number" class="debt-rate" placeholder="18" min="0" step="any"></div>' +
      '<div class="form-group"><label>Min Payment ($)</label><input type="number" class="debt-payment" placeholder="150" min="0" step="any"></div>' +
      '<div><button class="remove-debt" onclick="removeDebt(this)" title="Remove">&times;</button></div>';
    container.appendChild(div);
  }

  function removeDebt(btn) {
    var rows = document.querySelectorAll('.debt-row');
    if (rows.length <= 1) return;
    btn.closest('.debt-row').remove();
  }

  function simulatePayoff(debts, extra, strategy) {
    /* deep copy */
    var ds = debts.map(function(d) { return { balance: d.balance, rate: d.rate, minPay: d.minPay, name: d.name }; });

    /* sort: avalanche = highest rate first, snowball = lowest balance first */
    if (strategy === 'avalanche') {
      ds.sort(function(a, b) { return b.rate - a.rate; });
    } else {
      ds.sort(function(a, b) { return a.balance - b.balance; });
    }

    var months = 0;
    var totalInterest = 0;
    var maxMonths = 1200; /* 100 year safety cap */

    while (months < maxMonths) {
      var allPaid = ds.every(function(d) { return d.balance <= 0.005; });
      if (allPaid) break;
      months++;

      var extraLeft = extra;

      /* Apply minimum payments & interest */
      for (var i = 0; i < ds.length; i++) {
        if (ds[i].balance <= 0.005) continue;
        var interest = ds[i].balance * (ds[i].rate / 100 / 12);
        totalInterest += interest;
        ds[i].balance += interest;
        var pmt = Math.min(ds[i].minPay, ds[i].balance);
        ds[i].balance -= pmt;
      }

      /* Apply extra to top priority debt */
      for (var i = 0; i < ds.length; i++) {
        if (ds[i].balance <= 0.005 || extraLeft <= 0) continue;
        var apply = Math.min(extraLeft, ds[i].balance);
        ds[i].balance -= apply;
        extraLeft -= apply;
      }
    }

    return { months: months, totalInterest: totalInterest, capped: months >= maxMonths };
  }

  function calcDebt() {
    hideError('debt-error');
    hideResults('debt-results');

    var rows = document.querySelectorAll('.debt-row');
    var debts = [];
    var valid = true;
    rows.forEach(function(row, idx) {
      var bal = parseFloat(row.querySelector('.debt-balance').value);
      var rate = parseFloat(row.querySelector('.debt-rate').value);
      var pay = parseFloat(row.querySelector('.debt-payment').value);
      if (isNaN(bal) || bal <= 0 || isNaN(rate) || rate < 0 || isNaN(pay) || pay <= 0) {
        valid = false;
      } else {
        /* Validate minimum payment covers at least interest */
        var monthlyInterest = bal * (rate / 100 / 12);
        if (pay <= monthlyInterest) {
          showError('debt-error', 'Debt #' + (idx + 1) + ': minimum payment ($' + fmt(pay) + ') must exceed monthly interest ($' + fmt(monthlyInterest) + ') or the debt will never be paid off.');
          valid = false;
        }
        debts.push({ balance: bal, rate: rate, minPay: pay, name: 'Debt ' + (idx + 1) });
      }
    });

    if (!valid && !document.getElementById('debt-error').textContent) {
      showError('debt-error', 'Fill in all debt fields with valid numbers.');
      return;
    }
    if (!valid) return;

    var extra = getVal('debt-extra') || 0;

    var avalanche = simulatePayoff(debts, extra, 'avalanche');
    var snowball = simulatePayoff(debts, extra, 'snowball');

    var now = new Date();
    var payoffDate = new Date(now);
    payoffDate.setMonth(payoffDate.getMonth() + avalanche.months);
    var dateStr = payoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    var totalDebt = debts.reduce(function(s, d) { return s + d.balance; }, 0);

    var html = '';
    html += resultRow('Total Debt', totalDebt);

    if (debts.length === 1) {
      html += resultRowText('Months to Payoff', avalanche.months + ' months', 'teal');
      html += resultRowText('Payoff Date', dateStr);
      html += resultRow('Total Interest Paid', avalanche.totalInterest, 'rose');
      if (avalanche.capped) {
        html += resultRowText('Warning', 'Payment too low — payoff exceeds 100 years', 'rose');
      }
    } else {
      /* Comparison */
      html += '<p class="calc-subhead" style="margin-top:1.5rem;">Avalanche Method (Highest Rate First)</p>';
      html += resultRowText('Months to Payoff', avalanche.months + ' months', 'teal');
      html += resultRow('Total Interest Paid', avalanche.totalInterest, 'rose');

      var payoffDateSnow = new Date(now);
      payoffDateSnow.setMonth(payoffDateSnow.getMonth() + snowball.months);
      var dateStrSnow = payoffDateSnow.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      html += '<p class="calc-subhead" style="margin-top:1.5rem;">Snowball Method (Lowest Balance First)</p>';
      html += resultRowText('Months to Payoff', snowball.months + ' months', 'teal');
      html += resultRow('Total Interest Paid', snowball.totalInterest, 'rose');

      var saved = snowball.totalInterest - avalanche.totalInterest;
      if (saved > 0.01) {
        html += '<p class="calc-subhead" style="margin-top:1.5rem;">Comparison</p>';
        html += resultRow('Interest Saved (Avalanche vs Snowball)', saved, 'teal');
        html += resultRowText('Time Saved', (snowball.months - avalanche.months) + ' months');
      }
    }

    document.getElementById('debt-output').innerHTML = html;
    showResults('debt-results');
  }

  /* ================================================================
     4. SAVINGS GOAL
     ================================================================ */
  var savingsMode = 'goal';
  function switchSavMode(mode) {
    savingsMode = mode;
    document.querySelectorAll('#sav-mode-toggle button').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('#sav-mode-toggle button[data-mode="' + mode + '"]').classList.add('active');
    if (mode === 'goal') {
      document.getElementById('sav-target-group').style.display = '';
      document.getElementById('sav-contrib-group').style.display = 'none';
    } else {
      document.getElementById('sav-target-group').style.display = 'none';
      document.getElementById('sav-contrib-group').style.display = '';
    }
  }

  function calcSavings() {
    hideError('sav-error');
    hideResults('sav-results');

    var t = getVal('sav-time');
    var r = getVal('sav-rate');
    if (t === null || t <= 0) { showError('sav-error', 'Enter a valid timeline.'); return; }
    if (r === null || r < 0) { showError('sav-error', 'Enter a valid annual return rate.'); return; }

    var monthlyRate = (r / 100) / 12;
    var totalMonths = t * 12;
    var html = '';

    if (savingsMode === 'goal') {
      var target = getVal('sav-target');
      if (target === null || target <= 0) { showError('sav-error', 'Enter a valid target amount.'); return; }

      var monthlyContrib;
      if (monthlyRate === 0) {
        monthlyContrib = target / totalMonths;
      } else {
        /* PMT = FV * r / ((1+r)^n - 1) */
        monthlyContrib = target * monthlyRate / (Math.pow(1 + monthlyRate, totalMonths) - 1);
      }

      var totalContrib = monthlyContrib * totalMonths;
      var totalInterest = target - totalContrib;

      html += resultRow('Required Monthly Contribution', monthlyContrib, 'teal');
      html += resultRow('Total Contributed', totalContrib);
      html += resultRow('Interest Earned', totalInterest, 'violet');
      html += resultRow('Target Amount', target);
    } else {
      var contrib = getVal('sav-contrib');
      if (contrib === null || contrib <= 0) { showError('sav-error', 'Enter a valid monthly contribution.'); return; }

      var finalAmount;
      if (monthlyRate === 0) {
        finalAmount = contrib * totalMonths;
      } else {
        finalAmount = contrib * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate);
      }

      var totalContrib2 = contrib * totalMonths;
      var totalInterest2 = finalAmount - totalContrib2;

      html += resultRow('Final Amount', finalAmount, 'teal');
      html += resultRow('Total Contributed', totalContrib2);
      html += resultRow('Interest Earned', totalInterest2, 'violet');
    }

    document.getElementById('sav-output').innerHTML = html;
    showResults('sav-results');
  }

  /* ================================================================
     5. ROI
     ================================================================ */
  function calcROI() {
    hideError('roi-error');
    hideResults('roi-results');

    var initial = getVal('roi-initial');
    var final2 = getVal('roi-final');
    var years = getVal('roi-years');

    if (initial === null || initial <= 0) { showError('roi-error', 'Enter a valid initial investment greater than 0.'); return; }
    if (final2 === null || final2 < 0) { showError('roi-error', 'Enter a valid final value.'); return; }
    if (years === null || years <= 0) { showError('roi-error', 'Enter a valid time period greater than 0.'); return; }

    var roi = ((final2 - initial) / initial) * 100;
    var cagr = (Math.pow(final2 / initial, 1 / years) - 1) * 100;
    var totalGain = final2 - initial;

    var html = '';
    html += resultRowText('Total ROI', fmtPct(roi), roi >= 0 ? 'teal' : 'rose');
    html += resultRowText('Annualized Return (CAGR)', fmtPct(cagr), cagr >= 0 ? 'violet' : 'rose');
    html += resultRow('Total Gain / Loss', totalGain, totalGain >= 0 ? 'teal' : 'rose');
    html += resultRow('Initial Investment', initial);
    html += resultRow('Final Value', final2);
    html += resultRowText('Time Period', years + (years === 1 ? ' year' : ' years'));

    document.getElementById('roi-output').innerHTML = html;
    showResults('roi-results');
  }

  /* ================================================================
     6. FREELANCER TAX ESTIMATOR
     ================================================================ */
  function calcTax() {
    hideError('tax-error');
    hideResults('tax-results');

    var gross = getVal('tax-income');
    var expenses = getVal('tax-expenses') || 0;
    var status = document.getElementById('tax-status').value;
    var stateCode = document.getElementById('tax-state').value;

    if (gross === null || gross <= 0) { showError('tax-error', 'Enter a valid gross income.'); return; }
    if (expenses < 0) { showError('tax-error', 'Expenses cannot be negative.'); return; }
    if (expenses >= gross) { showError('tax-error', 'Expenses must be less than gross income.'); return; }

    var netIncome = gross - expenses;

    /* Self-employment tax: 15.3% on 92.35% of net self-employment income */
    var seBase = netIncome * 0.9235;
    /* Social Security tax: 12.4% on first $176,100 (2025), Medicare: 2.9% on all */
    var ssCap = 176100;
    var ssTax = Math.min(seBase, ssCap) * 0.124;
    var medicareTax = seBase * 0.029;
    /* Additional Medicare Tax: 0.9% on earnings above $200k single / $250k married */
    var additionalMedicareThreshold = (status === 'married') ? 250000 : 200000;
    var additionalMedicare = 0;
    if (seBase > additionalMedicareThreshold) {
      additionalMedicare = (seBase - additionalMedicareThreshold) * 0.009;
    }
    var selfEmploymentTax = ssTax + medicareTax + additionalMedicare;

    /* Deduction: half of SE tax */
    var seDeduction = selfEmploymentTax / 2;

    /* Adjusted gross income for federal tax */
    var agi = netIncome - seDeduction;

    /* Standard deduction 2025 */
    var standardDeduction = (status === 'married') ? 30000 : 15000;
    var taxableIncome = Math.max(0, agi - standardDeduction);

    /* 2025 Federal tax brackets */
    var brackets;
    if (status === 'single') {
      brackets = [
        { limit: 11925, rate: 0.10 },
        { limit: 48475, rate: 0.12 },
        { limit: 103350, rate: 0.22 },
        { limit: 197300, rate: 0.24 },
        { limit: 250525, rate: 0.32 },
        { limit: 626350, rate: 0.35 },
        { limit: Infinity, rate: 0.37 }
      ];
    } else {
      brackets = [
        { limit: 23850, rate: 0.10 },
        { limit: 96950, rate: 0.12 },
        { limit: 206700, rate: 0.22 },
        { limit: 394600, rate: 0.24 },
        { limit: 501050, rate: 0.32 },
        { limit: 752800, rate: 0.35 },
        { limit: Infinity, rate: 0.37 }
      ];
    }

    var federalTax = 0;
    var bracketDetails = [];
    var prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      if (taxableIncome <= prev) break;
      var taxable = Math.min(taxableIncome, brackets[i].limit) - prev;
      var tax = taxable * brackets[i].rate;
      federalTax += tax;
      bracketDetails.push({
        rate: (brackets[i].rate * 100).toFixed(0) + '%',
        range: '$' + fmt(prev) + ' — $' + (brackets[i].limit === Infinity ? '...' : fmt(brackets[i].limit)),
        taxable: taxable,
        tax: tax
      });
      prev = brackets[i].limit;
    }

    /* State tax (simplified flat rate estimate) */
    var stateRates = {
      none: 0, AL: 5.00, AZ: 2.50, AR: 4.40, CA: 9.30, CO: 4.40, CT: 5.00,
      DE: 6.60, GA: 5.49, HI: 8.25, ID: 5.80, IL: 4.95, IN: 3.05, IA: 5.70,
      KS: 5.70, KY: 4.00, LA: 4.25, ME: 7.15, MD: 5.75, MA: 5.00, MI: 4.25,
      MN: 7.85, MS: 5.00, MO: 4.95, MT: 5.90, NE: 5.84, NJ: 6.37, NM: 5.90,
      NY: 6.85, NC: 4.50, ND: 2.50, OH: 3.50, OK: 4.75, OR: 9.00, PA: 3.07,
      RI: 5.99, SC: 6.40, UT: 4.65, VT: 7.60, VA: 5.75, WV: 5.12, WI: 5.30,
      DC: 8.50
    };
    var stateRate = stateRates[stateCode] || 0;
    var stateTax = taxableIncome * (stateRate / 100);

    var totalTax = federalTax + selfEmploymentTax + stateTax;
    var effectiveRate = (totalTax / gross) * 100;
    var quarterlyPayment = totalTax / 4;
    var takeHome = gross - expenses - totalTax;

    var html = '';
    html += resultRow('Net Self-Employment Income', netIncome);
    html += resultRowText('Adjusted Gross Income', '$' + fmt(agi));
    html += resultRowText('Taxable Income (after std deduction)', '$' + fmt(taxableIncome));
    html += '<div style="height:0.75rem;"></div>';
    html += resultRow('Federal Income Tax', federalTax, 'violet');
    html += resultRow('Self-Employment Tax (15.3%)', selfEmploymentTax, 'amber');
    if (stateRate > 0) {
      html += resultRow('State Tax (' + stateRate.toFixed(2) + '%)', stateTax, 'rose');
    }
    html += '<div style="height:0.75rem;"></div>';
    html += resultRow('Total Estimated Tax', totalTax, 'rose');
    html += resultRowText('Effective Tax Rate', fmtPct(effectiveRate), 'amber');
    html += resultRow('Quarterly Payment (Est.)', quarterlyPayment, 'teal');
    html += resultRow('Estimated Take-Home', takeHome, 'teal');

    document.getElementById('tax-output').innerHTML = html;

    /* Bracket breakdown table */
    var tbl = '<table class="bracket-table"><thead><tr><th>Bracket</th><th>Range</th><th>Taxable</th><th>Tax</th></tr></thead><tbody>';
    for (var j = 0; j < bracketDetails.length; j++) {
      tbl += '<tr><td>' + bracketDetails[j].rate + '</td><td>' + bracketDetails[j].range + '</td><td>$' + fmt(bracketDetails[j].taxable) + '</td><td>$' + fmt(bracketDetails[j].tax) + '</td></tr>';
    }
    tbl += '</tbody></table>';
    document.getElementById('tax-brackets').innerHTML = tbl;

    showResults('tax-results');
  }

  /* ── FIRE Calculator ── */
  function calcFIRE() {
    hideError('fire-error');
    hideResults('fire-results');
    var expenses = getVal('fire-expenses');
    var swr = getVal('fire-rate');
    var current = getVal('fire-current');
    var contrib = getVal('fire-contrib');
    var ret = getVal('fire-return');
    var age = getVal('fire-age');
    if (expenses === null || expenses <= 0) { showError('fire-error','Annual expenses must be greater than zero.'); return; }
    if (swr === null || swr <= 0) { showError('fire-error','Safe withdrawal rate must be positive.'); return; }
    if (current === null) current = 0;
    if (contrib === null) contrib = 0;
    if (ret === null || ret < 0) { showError('fire-error','Expected return must be a non-negative number.'); return; }

    var fiNumber = expenses * (100 / swr);
    var leanFI = expenses * 0.75 * (100 / swr);
    var fatFI  = expenses * 2.0 * (100 / swr);
    var coastFI = current; // placeholder, we'll compute below

    /* Project years to FI */
    var r = ret / 100;
    var bal = current;
    var years = 0;
    var maxYears = 100;
    var rows = [];
    while (bal < fiNumber && years < maxYears) {
      years++;
      bal = bal * (1 + r) + contrib;
      if (years <= 50) rows.push({ year: years, balance: bal });
    }
    var reachedFI = bal >= fiNumber;
    var achievedAge = age !== null ? (age + years) : null;

    /* Coast FIRE: how much you need now so that with return only (no more contributions)
       you reach fiNumber by traditional retirement (age 65) */
    var coastYears = age !== null && age < 65 ? (65 - age) : 35;
    var coastNeeded = fiNumber / Math.pow(1 + r, coastYears);

    var html = '';
    html += resultRow('FI Number (' + swr + '% rule)', fiNumber, 'teal');
    html += resultRow('Lean FI (75% expenses)', leanFI, 'amber');
    html += resultRow('Fat FI (200% expenses)', fatFI, 'violet');
    html += resultRow('Coast FI (needed today)', coastNeeded, 'rose');
    html += '<div class="result-row"><span class="result-label">Progress</span><span class="result-value teal">' + fmtPct(Math.min(100, (current / fiNumber) * 100)) + '</span></div>';
    if (reachedFI) {
      html += resultRowText('Years to FI', years + ' years', 'teal');
      if (achievedAge) html += resultRowText('FI Age', achievedAge, 'teal');
    } else {
      html += resultRowText('Years to FI', 'Not reached within ' + maxYears + ' years', 'rose');
    }
    html += resultRow('Final Balance (projected)', bal, reachedFI ? 'teal' : 'rose');
    document.getElementById('fire-output').innerHTML = html;

    /* Table */
    var tbl = '<table class="growth-table"><thead><tr><th>Year</th><th>Balance</th></tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      tbl += '<tr><td>' + rows[i].year + '</td><td>$' + fmt(rows[i].balance) + '</td></tr>';
    }
    tbl += '</tbody></table>';
    document.getElementById('fire-table-wrap').innerHTML = tbl;

    showResults('fire-results');
  }

  /* ── Side Hustle Profit Calculator ── */
  function calcHustle() {
    hideError('hustle-error');
    hideResults('hustle-results');
    var revenue = getVal('hustle-revenue');
    var expenses = getVal('hustle-expenses') || 0;
    var feesPct = getVal('hustle-fees') || 0;
    var taxPct = getVal('hustle-tax') || 0;
    var hours = getVal('hustle-hours');
    var dayJob = getVal('hustle-dayjob');
    if (revenue === null || revenue <= 0) { showError('hustle-error','Monthly revenue must be greater than zero.'); return; }
    if (hours === null || hours <= 0) { showError('hustle-error','Hours per month must be greater than zero.'); return; }
    if (feesPct < 0 || feesPct > 100) { showError('hustle-error','Platform fees must be between 0 and 100.'); return; }
    if (taxPct < 0 || taxPct > 100) { showError('hustle-error','Tax rate must be between 0 and 100.'); return; }

    var platformFees = revenue * (feesPct / 100);
    var afterFees = revenue - platformFees;
    var grossProfit = afterFees - expenses;
    var taxOwed = grossProfit > 0 ? grossProfit * (taxPct / 100) : 0;
    var netProfit = grossProfit - taxOwed;
    var effectiveHourly = netProfit / hours;
    var annualNet = netProfit * 12;

    var html = '';
    html += resultRow('Revenue (monthly)', revenue, 'teal');
    html += resultRow('Platform Fees', -platformFees, 'rose');
    html += resultRow('Business Expenses', -expenses, 'rose');
    html += resultRow('Taxes Owed', -taxOwed, 'amber');
    html += resultRow('Net Profit (monthly)', netProfit, netProfit > 0 ? 'teal' : 'rose');
    html += resultRow('Net Profit (annual)', annualNet, annualNet > 0 ? 'teal' : 'rose');
    html += resultRow('Effective Hourly Rate', effectiveHourly, effectiveHourly > 0 ? 'teal' : 'rose');

    if (dayJob !== null && dayJob > 0) {
      var delta = effectiveHourly - dayJob;
      var color = delta >= 0 ? 'teal' : 'rose';
      html += resultRow('Day Job Rate', dayJob, 'violet');
      html += resultRow('Premium vs Day Job', delta, color);
      var pct = (delta / dayJob) * 100;
      html += '<div class="result-row"><span class="result-label">Premium %</span><span class="result-value ' + color + '">' + (pct >= 0 ? '+' : '') + fmtPct(pct) + '</span></div>';
      if (delta < 0) {
        html += '<p style="color:var(--rose);font-size:0.78rem;margin-top:0.75rem;">\u26A0 Your side hustle pays less per hour than your day job. Consider whether the learning, autonomy, or upside justifies the gap.</p>';
      }
    }

    document.getElementById('hustle-output').innerHTML = html;
    showResults('hustle-results');
  }

  /* ── Crypto DCA Calculator ── */
  function calcDCA() {
    hideError('dca-error');
    hideResults('dca-results');
    var amount = getVal('dca-amount');
    var freqDays = parseInt(document.getElementById('dca-freq').value);
    var duration = getVal('dca-duration');
    var startPrice = getVal('dca-start');
    var endPrice = getVal('dca-end');
    var volatility = getVal('dca-volatility');
    if (amount === null || amount <= 0) { showError('dca-error','Amount per buy must be greater than zero.'); return; }
    if (duration === null || duration <= 0) { showError('dca-error','Duration must be at least 1 month.'); return; }
    if (startPrice === null || startPrice <= 0) { showError('dca-error','Start price must be greater than zero.'); return; }
    if (endPrice === null || endPrice <= 0) { showError('dca-error','End price must be greater than zero.'); return; }
    if (volatility === null || volatility < 0) volatility = 0;

    /* Total buys */
    var totalDays = duration * 30;
    var numBuys = Math.floor(totalDays / freqDays);
    if (numBuys < 1) numBuys = 1;

    /* Simulate a deterministic price path: linear interpolation + sine wave oscillation */
    var rows = [];
    var totalCoins = 0;
    var totalSpent = 0;
    var minPrice = Infinity, maxPrice = -Infinity;
    for (var i = 0; i < numBuys; i++) {
      var t = i / (numBuys - 1 || 1);
      var trend = startPrice + (endPrice - startPrice) * t;
      var oscillation = trend * (volatility / 100) * Math.sin(t * Math.PI * 4);
      var price = Math.max(0.0001, trend + oscillation);
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
      var coins = amount / price;
      totalCoins += coins;
      totalSpent += amount;
      if (i < 60) rows.push({ n: i + 1, price: price, coins: coins, spent: totalSpent });
    }

    var avgBuyPrice = totalSpent / totalCoins;
    var currentValue = totalCoins * endPrice;
    var profit = currentValue - totalSpent;
    var profitPct = (profit / totalSpent) * 100;

    /* Lump sum comparison */
    var lumpCoins = totalSpent / startPrice;
    var lumpValue = lumpCoins * endPrice;
    var lumpProfit = lumpValue - totalSpent;

    var html = '';
    html += resultRowText('Number of Buys', numBuys, 'violet');
    html += resultRow('Total Invested', totalSpent, 'violet');
    html += resultRowText('Total Coins Acquired', totalCoins.toFixed(6), 'teal');
    html += resultRow('Average Buy Price', avgBuyPrice, 'amber');
    html += resultRow('Final Portfolio Value', currentValue, 'teal');
    html += resultRow('DCA Profit / Loss', profit, profit >= 0 ? 'teal' : 'rose');
    html += '<div class="result-row"><span class="result-label">DCA Return</span><span class="result-value ' + (profit >= 0 ? 'teal' : 'rose') + '">' + (profit >= 0 ? '+' : '') + fmtPct(profitPct) + '</span></div>';
    html += '<div style="height:1px;background:var(--border);margin:1rem 0;"></div>';
    html += resultRow('Lump Sum Value (for comparison)', lumpValue, 'violet');
    html += resultRow('Lump Sum Profit / Loss', lumpProfit, lumpProfit >= 0 ? 'teal' : 'rose');
    var edge = profit - lumpProfit;
    html += resultRow('DCA vs Lump Sum', edge, edge >= 0 ? 'teal' : 'rose');
    html += '<p style="color:var(--text-secondary);font-size:0.75rem;margin-top:0.75rem;">' + (edge >= 0 ? 'DCA outperformed lump sum here (price volatility worked in your favor).' : 'Lump sum outperformed DCA here (a rising market rewards earlier entry).') + '</p>';

    document.getElementById('dca-output').innerHTML = html;

    /* Buy history table */
    var tbl = '<table class="growth-table"><thead><tr><th>#</th><th>Price</th><th>Coins Bought</th><th>Total Spent</th></tr></thead><tbody>';
    for (var j = 0; j < rows.length; j++) {
      tbl += '<tr><td>' + rows[j].n + '</td><td>$' + fmt(rows[j].price) + '</td><td>' + rows[j].coins.toFixed(6) + '</td><td>$' + fmt(rows[j].spent) + '</td></tr>';
    }
    if (numBuys > 60) tbl += '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">... and ' + (numBuys - 60) + ' more buys</td></tr>';
    tbl += '</tbody></table>';
    document.getElementById('dca-table-wrap').innerHTML = tbl;

    showResults('dca-results');
  }
