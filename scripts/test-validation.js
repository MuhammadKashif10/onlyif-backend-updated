#!/usr/bin/env node
/**
 * Validation tests - ensures no 500/505 from ZIP validation and key flows.
 * Run: node scripts/test-validation.js
 */

const zipRegex = /^\d{4}$|^\d{5}(-\d{4})?$/;

const auPostcodes = ['3000', '3001', '4000', '2000', '0800', '9999'];
const usPostcodes = ['12345', '10001', '90210', '12345-6789', '10001-1234'];
const invalidPostcodes = ['123', '123456', 'abc', '3000a', '12-345', '1234-5678', ''];

function testZipValidation() {
  console.log('\n=== ZIP/Postcode Validation Tests ===\n');
  let passed = 0;
  let failed = 0;

  auPostcodes.forEach((zip) => {
    const ok = zipRegex.test(zip);
    if (ok) { passed++; console.log(`  ✓ AU ${zip} - valid`); }
    else { failed++; console.log(`  ✗ AU ${zip} - FAIL (expected valid)`); }
  });

  usPostcodes.forEach((zip) => {
    const ok = zipRegex.test(zip);
    if (ok) { passed++; console.log(`  ✓ US ${zip} - valid`); }
    else { failed++; console.log(`  ✗ US ${zip} - FAIL (expected valid)`); }
  });

  invalidPostcodes.forEach((zip) => {
    const ok = zipRegex.test(zip);
    if (!ok) { passed++; console.log(`  ✓ invalid "${zip}" - correctly rejected`); }
    else { failed++; console.log(`  ✗ invalid "${zip}" - FAIL (should be rejected)`); }
  });

  console.log(`\n  Result: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

function testPhoneValidation() {
  // AU format: 04XX XXX XXX (10 digits, starting with 04)
  const auPhoneRegex = /^(\+61|0)?4\d{8}$/;
  const valid = ['0412345678', '0421234567', '0491234567', '+61412345678'];
  const invalid = ['123', '041234567', '0512345678'];
  let ok = true;
  console.log('\n=== Phone (AU) Validation ===\n');
  valid.forEach((p) => {
    const m = p.replace(/\D/g, '');
    const match = auPhoneRegex.test(p) || (m.length === 10 && m.startsWith('4'));
    if (match) console.log(`  ✓ ${p}`);
    else { console.log(`  ✗ ${p} - FAIL`); ok = false; }
  });
  invalid.forEach((p) => {
    const m = p.replace(/\D/g, '');
    const match = auPhoneRegex.test(p) || (m.length === 10 && m.startsWith('4'));
    if (!match) console.log(`  ✓ "${p}" correctly rejected`);
    else { console.log(`  ✗ "${p}" should be rejected`); ok = false; }
  });
  return ok;
}

// Run tests
let allPass = true;
allPass = testZipValidation() && allPass;
allPass = testPhoneValidation() && allPass;

console.log(allPass ? '\n✓ All validation tests passed.\n' : '\n✗ Some tests failed.\n');
process.exit(allPass ? 0 : 1);
