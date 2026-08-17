import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchTerm, mapScraperRecord } from "./self-hosted-google-maps.server";
import { normalizeBusinessLead } from "../normalize";

test("1. Query: 'gyms near Godrej Garden City Ahmedabad' is accepted as-is without separately supplied city/state", () => {
  const term = buildSearchTerm({
    query: "gyms near Godrej Garden City Ahmedabad",
    location: null,
  });
  assert.equal(term, "gyms near Godrej Garden City Ahmedabad");
});

test("2. Query: 'pizza shops near Gota Ahmedabad' is accepted as-is", () => {
  const term = buildSearchTerm({
    query: "pizza shops near Gota Ahmedabad",
    location: null,
  });
  assert.equal(term, "pizza shops near Gota Ahmedabad");
});

test("3. Additional valid queries ('flower shops in Nikol Ahmedabad', 'restaurants near Bopal Ahmedabad') are accepted as-is", () => {
  assert.equal(
    buildSearchTerm({ query: "flower shops in Nikol Ahmedabad" }),
    "flower shops in Nikol Ahmedabad",
  );
  assert.equal(
    buildSearchTerm({ query: "restaurants near Bopal Ahmedabad" }),
    "restaurants near Bopal Ahmedabad",
  );
});

test("4. A result with company_name = 'GYM ONE', address = null, and city/region/country = null is still accepted", () => {
  const rawInput = {
    company_name: "GYM ONE",
    address: null,
    city: null,
    region: null,
    country: null,
  };

  const lead = normalizeBusinessLead(rawInput);

  assert.notEqual(lead, null);
  assert.equal(lead?.company_name, "GYM ONE");
  assert.equal(lead?.address, null);
  assert.equal(lead?.city, null);
  assert.equal(lead?.region, null);
  assert.equal(lead?.country, null);
});

test("5. A result with a valid full address but incomplete/null derived location fields is not rejected", () => {
  const fullAddress =
    "Shop No. 11, 12, Decent Florist - Flower Shop, Vaibhav Park Society, opposite Krishna Vihar, Krishna Vihar Society, New India Colony, Nikol, Ahmedabad, Gujarat 380049, India";
  
  const rawInput = {
    company_name: "Decent Florist",
    address: fullAddress,
    city: null,
    region: null,
    country: null,
    postal_code: null,
    phone: "+91 88498 81599",
  };

  const normalized = normalizeBusinessLead(rawInput);
  assert.notEqual(normalized, null);
  assert.equal(normalized?.company_name, "Decent Florist");
  assert.equal(normalized?.address, fullAddress);
  assert.equal(Boolean(normalized?.company_name), true);
});

test("6. If extraction succeeds from address or complete_address, derived fields are stored", () => {
  const record = {
    title: "Decent Florist",
    address: "Shop No. 11, 12, Vaibhav Park, Nikol, Ahmedabad, Gujarat 380049, India",
    complete_address: {
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
      postal_code: "380049",
    },
  };

  const lead = mapScraperRecord(record);
  assert.equal(lead.company_name, "Decent Florist");
  assert.equal(lead.city, "Ahmedabad");
  assert.equal(lead.region, "Gujarat");
  assert.equal(lead.country, "India");
  assert.equal(lead.postal_code, "380049");
});

test("7. Query with separate location parameter appends location if not already present", () => {
  const term = buildSearchTerm({
    query: "pizza shops",
    location: "Ahmedabad, India",
  });
  assert.equal(term, "pizza shops, Ahmedabad, India");
});
