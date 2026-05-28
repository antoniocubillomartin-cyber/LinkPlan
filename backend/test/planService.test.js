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

function build(duration) {
  return generatePlan({
    organizer,
    companions,
    budgetPerPerson: 50,
    date: '2026-05-27',
    zone: 'Centro',
    restaurants,
    activities,
    duration
  });
}

test('corto genera solo la comida (1 plan)', () => {
  const plan = build('corto');
  assert.equal(plan.totalPeople, 2);
  assert.equal(plan.totalBudget, 100);
  assert.ok(plan.lunch);
  assert.equal(plan.morning, null);
  assert.equal(plan.afternoon, null);
  assert.equal(plan.totalCost, plan.lunch.price * 2);
});

test('medio genera actividad + comida (2 planes)', () => {
  const plan = build('medio');
  assert.ok(plan.morning);
  assert.ok(plan.lunch);
  assert.equal(plan.afternoon, null);
  assert.equal(plan.totalCost, (plan.morning.price + plan.lunch.price) * 2);
});

test('largo genera actividad + comida + actividad (3 planes)', () => {
  const plan = build('largo');
  assert.ok(plan.morning);
  assert.ok(plan.lunch);
  assert.ok(plan.afternoon);
  assert.notEqual(plan.morning.id, plan.afternoon.id);
  assert.equal(plan.totalCost, (plan.morning.price + plan.lunch.price + plan.afternoon.price) * 2);
});
