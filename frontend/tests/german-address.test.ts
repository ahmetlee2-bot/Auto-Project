import assert from "node:assert/strict";
import test from "node:test";
import { parseGermanShippingAddress } from "../lib/orders/germanAddressParser";

test("parses standard German street and house number correctly", () => {
  const parsed = parseGermanShippingAddress({
    fullName: "Max Mustermann",
    addressLine1: "Hauptstraße 45",
    postalCode: "10115",
    city: "Berlin",
    countryCode: "DE",
    phoneNumber: "015112345678",
  });

  assert.equal(parsed.fullName, "Max Mustermann");
  assert.equal(parsed.isPackstation, false);
  assert.equal(parsed.street, "Hauptstraße");
  assert.equal(parsed.houseNumber, "45");
  assert.equal(parsed.postalCode, "10115");
  assert.equal(parsed.city, "Berlin");
  assert.match(parsed.formattedText, /Hauptstraße 45/);
  assert.match(parsed.formattedText, /10115 Berlin/);
});

test("parses compound house numbers and letter suffixes", () => {
  const parsed = parseGermanShippingAddress({
    fullName: "Erika Musterfrau",
    addressLine1: "Berliner Allee 12-14 b",
    addressLine2: "Hinterhaus 2. OG",
    postalCode: "20095",
    city: "Hamburg",
  });

  assert.equal(parsed.street, "Berliner Allee");
  assert.equal(parsed.houseNumber, "12-14 b");
  assert.equal(parsed.addressLine2, "Hinterhaus 2. OG");
  assert.equal(parsed.city, "Hamburg");
});

test("parses DHL Packstation with Postnummer correctly", () => {
  const parsed = parseGermanShippingAddress({
    fullName: "Hans Schmidt",
    addressLine1: "Packstation 102",
    addressLine2: "Postnummer 98765432",
    postalCode: "50667",
    city: "Köln",
  });

  assert.equal(parsed.isPackstation, true);
  assert.equal(parsed.packstationNumber, "102");
  assert.equal(parsed.postNumber, "98765432");
  assert.equal(parsed.street, "Packstation 102");
  assert.match(parsed.formattedText, /PostNummer: 98765432/);
  assert.match(parsed.formattedText, /Packstation 102/);
});
