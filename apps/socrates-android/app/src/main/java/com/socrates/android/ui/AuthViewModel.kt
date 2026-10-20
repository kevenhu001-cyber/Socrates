package com.socrates.android.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.socrates.android.data.ApiClient
import com.socrates.android.data.AuthOperations
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale

 data class AuthUiState(val busy:Boolean=false, val error:String?=null, val message:String?=null, val cooldown:Int=0, val user:JSONObject?=null, val usage:JSONObject?=null)
class AuthViewModel(app: Application): AndroidViewModel(app) {
    // Recreate the lightweight facade per operation: the persisted base URL may change while this ViewModel lives.
    private val ops get() = AuthOperations(ApiClient(getApplication<Application>()))
    private val mutable = MutableStateFlow(AuthUiState()); val state=mutable.asStateFlow()
    private fun emailValid(e:String)=AuthValidation.validEmail(e)
    private fun passValid(p:String)=AuthValidation.validPassword(p)
    private fun run(message:String?=null, action:suspend ()->Unit) {
        if(mutable.value.busy)return
        mutable.update{it.copy(busy=true,error=null,message=null)}
        viewModelScope.launch { try { action(); mutable.update{it.copy(busy=false,message=message)} } catch(e:Exception){ mutable.update{it.copy(busy=false,error=e.message ?: "请求失败")} } }
    }
    fun login(email:String,password:String,onSuccess:(JSONObject)->Unit) { if(!emailValid(email)||password.isBlank()){mutable.update{it.copy(error="请输入有效邮箱和密码")};return}; run { val u=withContext(Dispatchers.IO){ops.login(email.trim(),password)}; mutable.update{it.copy(user=u)}; onSuccess(u) } }
    fun loginCode(email:String,code:String,onSuccess:(JSONObject)->Unit) { if(!emailValid(email)||!AuthValidation.validCode(code)){mutable.update{it.copy(error="请输入有效邮箱和 6 位验证码")};return}; run { val u=withContext(Dispatchers.IO){ops.loginWithCode(email.trim(),code)}; mutable.update{it.copy(user=u)}; onSuccess(u) } }
    fun register(email:String,password:String,confirm:String) { if(!emailValid(email)||!passValid(password)||password!=confirm){mutable.update{it.copy(error="请检查邮箱；密码需为 8–64 位且两次输入一致")};return}; run("注册已提交。请查收邮箱并完成验证，然后使用密码登录。") { withContext(Dispatchers.IO){ops.register(email.trim(),password)} } }
    fun sendCode(email:String) { if(!emailValid(email)){mutable.update{it.copy(error="请输入有效邮箱")};return}; if(mutable.value.cooldown>0)return; run("验证码已发送，请查收邮箱。") { withContext(Dispatchers.IO){ops.sendCode(email.trim())}; mutable.update{it.copy(cooldown=60)}; viewModelScope.launch { while(mutable.value.cooldown>0){delay(1000);mutable.update{it.copy(cooldown=(it.cooldown-1).coerceAtLeast(0))}} } } }
    fun forgotPassword(email:String) { if(!emailValid(email)){mutable.update{it.copy(error="请输入有效邮箱")};return}; run("如该邮箱已注册，密码重置邮件将发送至该地址。") { withContext(Dispatchers.IO){ops.forgotPassword(email.trim())} } }
    fun resetPassword(token:String,password:String,confirm:String) { if(token.isBlank()||!passValid(password)||password!=confirm){mutable.update{it.copy(error="重置链接无效，或密码需为 8–64 位且两次输入一致")};return}; run("密码已重置，请使用新密码登录。") {withContext(Dispatchers.IO){ops.resetPassword(token,password)}} }
    fun loadAccount() { mutable.update { it.copy(user=null,usage=null) }; run { val result=withContext(Dispatchers.IO){ops.usage()}; mutable.update{it.copy(user=result.optJSONObject("user"),usage=result)} } }
    fun changePassword(old:String,new:String,confirm:String) { if(old.isBlank()||!passValid(new)||new!=confirm){mutable.update{it.copy(error="请检查当前密码；新密码需为 8–64 位且两次输入一致")};return};run("密码已更新。") {withContext(Dispatchers.IO){ops.changePassword(old,new)}} }
    fun clearMessage(){mutable.update{it.copy(message=null,error=null)}}
}
