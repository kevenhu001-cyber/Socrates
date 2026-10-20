package com.socrates.android.data

import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Pure JVM protocol primitives; no Android APIs or secret logging. */
object BrowserLoginHandoff {
 const val ORIGIN="https://app.topodrive.top"; const val CALLBACK="$ORIGIN/auth/android/callback"; const val TTL_MS=600000L
 data class Pending(val code:String,val state:String,val verifier:String,val createdAt:Long)
 fun b64(bytes:ByteArray)=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
 fun challenge(verifier:String)=b64(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
 fun state(bytes:ByteArray)=bytes.joinToString(""){"%02x".format(it)}
 fun newVerifier(random:SecureRandom=SecureRandom())=b64(ByteArray(32).also(random::nextBytes))
 fun newState(random:SecureRandom=SecureRandom())=state(ByteArray(32).also(random::nextBytes))
 fun productionBase(base:String):Boolean=try { val u=URI(base.trimEnd('/')); u.scheme=="https" && u.rawAuthority=="app.topodrive.top" && u.rawPath=="/api/v2" && u.rawQuery==null && u.rawFragment==null } catch(_:Exception){false}
 fun parseCallback(raw:String?, expectedState:String, verifier:String, createdAt:Long, now:Long):Pending? {
  fun valid(x:String?)=x?.matches(Regex("[0-9a-f]{64}"))==true
  if(!valid(expectedState)||!verifier.matches(Regex("[A-Za-z0-9_-]{43,128}"))||now<createdAt||now-createdAt>=TTL_MS)return null
  val u=try{URI(raw)}catch(_:Exception){return null}
  if(u.scheme!="https"||u.rawAuthority!="app.topodrive.top"||u.rawUserInfo!=null||u.port!=-1||u.rawPath!="/auth/android/callback"||u.rawQuery!=null)return null
  val fields=(u.rawFragment?:return null).split('&'); if(fields.size!=2)return null
  val m=linkedMapOf<String,String>(); for(f in fields){val i=f.indexOf('=');if(i<=0||m.put(f.substring(0,i),f.substring(i+1))!=null)return null}
  val code=m["code"];val got=m["state"]
  if(m.keys!=setOf("code","state")||code?.matches(Regex("[0-9a-f]{64}"))!=true||!valid(got))return null
  if(!MessageDigest.isEqual(expectedState.toByteArray(Charsets.US_ASCII),got!!.toByteArray(Charsets.US_ASCII)))return null
  return Pending(code,got,verifier,createdAt)
 }
}
