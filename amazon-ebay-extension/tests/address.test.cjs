const assert = require("node:assert/strict");
const path = require("node:path");
const { parseGermanShippingAddress } = require(path.join(__dirname, "..", "addressParser.js"));

const std = parseGermanShippingAddress({
  fullName: "Max Mustermann",
  addressLine1: "Hauptstraße 45",
  postalCode: "10115",
  city: "Berlin",
  countryCode: "DE",
  phoneNumber: "015112345678",
});
assert.equal(std.fullName, "Max Mustermann");
assert.equal(std.isPackstation, false);
assert.equal(std.street, "Hauptstraße");
assert.equal(std.houseNumber, "45");
assert.equal(std.postalCode, "10115");
assert.equal(std.city, "Berlin");

const pack = parseGermanShippingAddress({
  fullName: "Hans Schmidt",
  addressLine1: "Packstation 102",
  addressLine2: "Postnummer 98765432",
  postalCode: "50667",
  city: "Köln",
});
assert.equal(pack.isPackstation, true);
assert.equal(pack.packstationNumber, "102");
assert.equal(pack.postNumber, "98765432");

console.log("German address parser tests passed.");
