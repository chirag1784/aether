package com.pramana.evidence.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(session: SessionEntity)

    @Update
    suspend fun update(session: SessionEntity)

    @Query("SELECT * FROM sessions ORDER BY updatedAtUtc DESC")
    fun observeAll(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE sessionId = :sessionId")
    suspend fun get(sessionId: String): SessionEntity?
}

@Dao
interface AssetDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(asset: AssetEntity)

    @Update
    suspend fun update(asset: AssetEntity)

    @Query("SELECT * FROM assets WHERE sessionId = :sessionId AND deleted = 0 ORDER BY capturedAtUtc ASC")
    fun observeForSession(sessionId: String): Flow<List<AssetEntity>>

    @Query("SELECT * FROM assets WHERE sessionId = :sessionId ORDER BY capturedAtUtc ASC")
    suspend fun allForSession(sessionId: String): List<AssetEntity>

    @Query("SELECT * FROM assets WHERE envelopeId = :envelopeId")
    suspend fun get(envelopeId: String): AssetEntity?
}
