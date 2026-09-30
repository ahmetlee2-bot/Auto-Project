export function legalIdentity() {
  const company = process.env.LEGAL_COMPANY?.trim() || "[Musterfirma GmbH]";
  const address =
    process.env.LEGAL_ADDRESS?.trim() || "[Musterstraße 1, 10115 Berlin]";
  const email =
    process.env.LEGAL_EMAIL?.trim() || "[kontakt@autolister-app.de]";
  const vatId = process.env.LEGAL_VAT_ID?.trim() || "[DE999999999]";
  return {
    company,
    address,
    email,
    vatId,
    isExample: [company, address, email, vatId].some((value) =>
      value.startsWith("["),
    ),
  };
}
