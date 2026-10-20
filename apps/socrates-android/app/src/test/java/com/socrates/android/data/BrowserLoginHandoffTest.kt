package com.socrates.android.data

import org.junit.Assert.*
import org.junit.Test

class BrowserLoginHandoffTest {
 private val verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
 private val state="a".repeat(64); private val code="b".repeat(64); private val time=1_000_000L
 @Test fun rfc7636S256Vector(){ assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",BrowserLoginHandoff.challenge(verifier)) }
 @Test fun validatesMatchingStateAndStrictCallback(){ assertEquals(code,BrowserLoginHandoff.parseCallback("${BrowserLoginHandoff.CALLBACK}#code=$code&state=$state",state,verifier,time,time+1)?.code) }
 @Test fun rejectsWrongStateExpiryReplayColdStartAndClockRollback(){
  assertNull(BrowserLoginHandoff.parseCallback("${BrowserLoginHandoff.CALLBACK}#code=$code&state=${"c".repeat(64)}",state,verifier,time,time+1))
  assertNull(BrowserLoginHandoff.parseCallback("${BrowserLoginHandoff.CALLBACK}#code=$code&state=$state",state,verifier,time,time+600000))
  assertNull(BrowserLoginHandoff.parseCallback("${BrowserLoginHandoff.CALLBACK}#code=$code&state=$state",state,verifier,time,time-1))
  assertNull(BrowserLoginHandoff.parseCallback(null,state,verifier,time,time+1))
 }
 @Test fun callbackRejectsOriginPathQueryUserInfoPortAndDuplicateFields(){
  val suffix="#code=$code&state=$state"
  listOf("http://app.topodrive.top/auth/android/callback$suffix","https://evil.example/auth/android/callback$suffix","https://app.topodrive.top/else$suffix","https://app.topodrive.top:443/auth/android/callback$suffix","https://user@app.topodrive.top/auth/android/callback$suffix","${BrowserLoginHandoff.CALLBACK}?x=1$suffix","${BrowserLoginHandoff.CALLBACK}#code=$code&state=$state&state=$state","${BrowserLoginHandoff.CALLBACK}#code=$code&state=$state&x=y").forEach { assertNull(it,BrowserLoginHandoff.parseCallback(it,state,verifier,time,time+1)) }
 }
 @Test fun rejectsNonProductionOrCustomizedApiBases(){
  assertTrue(BrowserLoginHandoff.productionBase("https://app.topodrive.top/api/v2")); assertTrue(BrowserLoginHandoff.productionBase("https://app.topodrive.top/api/v2/"))
  listOf("https://other.example/api/v2","https://app.topodrive.top.evil/api/v2","https://app.topodrive.top:443/api/v2","http://app.topodrive.top/api/v2","https://app.topodrive.top/api/v1","https://app.topodrive.top/api/v2?x=y").forEach { assertFalse(it,BrowserLoginHandoff.productionBase(it)) }
 }
}
