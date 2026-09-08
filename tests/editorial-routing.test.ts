import test from "node:test";
import assert from "node:assert/strict";
import { editorialLangFromPath, editorialLanguagePath, editorialAlternates } from "../lib/editorial-routing";
test("seules les pages éditoriales publiques reçoivent une URL traduite",()=>{
  assert.equal(editorialLanguagePath("/aide","ht"),"/ht/aide");
  assert.equal(editorialLanguagePath("/en/recharges","es"),"/es/recharges");
  for(const path of ["/admin","/api/checkout","/en/admin","/mes-achats","/en/aide/secret"]) {
    assert.equal(editorialLanguagePath(path,"ht"),null);
    assert.equal(editorialLangFromPath(path),undefined);
  }
  assert.equal(editorialLangFromPath("/ht/aide"),"ht");
  assert.equal(editorialLangFromPath("/zz/aide"),undefined);
  const alternates=editorialAlternates("/aide","en");
  assert.equal(alternates.canonical,"/en/aide");
  assert.equal(alternates.languages["x-default"],"/fr/aide");
});
