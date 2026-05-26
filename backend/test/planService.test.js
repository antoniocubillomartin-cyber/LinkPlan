const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../src/services/planService');

const organizer = { id: 'u1', foodTags: ['tapas'], activityTags: ['arte'], pace: 'moderado' };
const companions = [{ id: 'u2', foodTags: ['vegetariano'], activityTags: ['naturaleza'], pace: 'relajado' }];
const restaurants = [
  { id: 'r1', tags: ['tapas'], zone: 'Centro', price: 20, available: true },
  { id: 'r2', tags: ['vegetariano'], zone: 'Retiro', price: 18, available: true }
];
const activities = [
  { id: 'a1', tags: ['arte'], zone: 'Centro', price: 12, available: true },
  { id: 'a2', tags: ['naturaleza'], zone: 'Retiro', price: 0, available: true }
];

test('generatePlan returns itinerary and budget totals', () => {
  const plan = generatePlan({
    organizer,
    companions,
    budgetPerPerson: 50,
    date: '2026-05-27',
    zone: 'Centro',
    restaurants,
    activities
  });

  assert.equal(plan.totalPeople, 2);
  assert.equal(plan.totalBudget, 100);
  assert.ok(plan.morning);
  assert.ok(plan.lunch);
  assert.ok(plan.afternoon);
});
