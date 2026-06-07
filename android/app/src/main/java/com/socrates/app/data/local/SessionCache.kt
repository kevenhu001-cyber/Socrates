package com.socrates.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/**
 * Local Room cache for the things the web app keeps in localStorage
 * (`socrates-sessions-v2`, mistakes, recent agent runs). It is best-
 * effort: the server is the source of truth, and we only write here
 * when the server has confirmed persistence.
 */
@Entity(tableName = "sessions")
data class SessionRow(
    @PrimaryKey val id: String,
    val title: String?,
    val topic: String?,
    val mode: String,                       // "tutor" | "chat" | "agent"
    val preview: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val pinned: Boolean = false
)

@Entity(tableName = "mistakes")
data class MistakeRow(
    @PrimaryKey val id: String,
    val sessionId: String?,
    val question: String,
    val userAnswer: String,
    val correctAnswer: String?,
    val explanation: String?,
    val nodeName: String?,
    val createdAt: Long
)

@Dao
interface SessionDao {
    @Query("SELECT * FROM sessions ORDER BY updatedAt DESC LIMIT :limit")
    fun observe(limit: Int = 50): Flow<List<SessionRow>>

    @Query("SELECT * FROM sessions WHERE id = :id")
    suspend fun byId(id: String): SessionRow?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: SessionRow)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<SessionRow>)

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM sessions")
    suspend fun clear()
}

@Dao
interface MistakeDao {
    @Query("SELECT * FROM mistakes ORDER BY createdAt DESC")
    fun observe(): Flow<List<MistakeRow>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: MistakeRow)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<MistakeRow>)

    @Query("DELETE FROM mistakes WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT COUNT(*) FROM mistakes")
    suspend fun count(): Int
}

@Database(
    entities = [SessionRow::class, MistakeRow::class],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class SocratesDb : RoomDatabase() {
    abstract fun sessions(): SessionDao
    abstract fun mistakes(): MistakeDao
}

class Converters {
    @TypeConverter fun fromLong(v: Long?): Long? = v
    @TypeConverter fun toLong(v: Long?): Long? = v
}

class SessionCache(context: Context) {
    private val db = Room.databaseBuilder(
        context.applicationContext,
        SocratesDb::class.java,
        "socrates.db"
    ).fallbackToDestructiveMigration().build()

    val sessionDao: SessionDao get() = db.sessions()
    val mistakeDao: MistakeDao get() = db.mistakes()
}
