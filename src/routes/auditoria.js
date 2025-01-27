import express from "express";
import { connectToDatabase } from "../config/db.js";
import { logger } from "../config/logger.js";

const router = express.Router();

// Chequeo 1: Datos huérfanos
router.get("/1", async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const query = `
      IF OBJECT_ID('tempdb..#OrphanRecords') IS NOT NULL
        DROP TABLE #OrphanRecords;

      CREATE TABLE #OrphanRecords (
        TableName NVARCHAR(128),
        OrphanCount INT
      );

      DECLARE @tableName NVARCHAR(128);
      DECLARE @referencedTableName NVARCHAR(128);
      DECLARE @parentColumnName NVARCHAR(128);
      DECLARE @referencedColumnName NVARCHAR(128);
      DECLARE @sql NVARCHAR(MAX);

      DECLARE cur CURSOR FOR
      SELECT 
        t.name AS TableName,
        rt.name AS ReferencedTableName,
        c.name AS ParentColumnName,
        rc.name AS ReferencedColumnName
      FROM 
        sys.foreign_key_columns AS fkc
      INNER JOIN 
        sys.tables AS t ON fkc.parent_object_id = t.object_id
      INNER JOIN 
        sys.tables AS rt ON fkc.referenced_object_id = rt.object_id
      INNER JOIN 
        sys.columns AS c ON fkc.parent_column_id = c.column_id AND fkc.parent_object_id = c.object_id
      INNER JOIN 
        sys.columns AS rc ON fkc.referenced_column_id = rc.column_id AND fkc.referenced_object_id = rc.object_id;

      OPEN cur;

      FETCH NEXT FROM cur INTO @tableName, @referencedTableName, @parentColumnName, @referencedColumnName;

      WHILE @@FETCH_STATUS = 0
      BEGIN
        SET @sql = '
        INSERT INTO #OrphanRecords (TableName, OrphanCount)
        SELECT ''' + @tableName + ''' AS TableName, 
              COUNT(*) AS OrphanCount
        FROM ' + QUOTENAME(@tableName) + ' AS pt
        WHERE NOT EXISTS 
            (SELECT 1 
             FROM ' + QUOTENAME(@referencedTableName) + ' AS rt 
             WHERE pt.' + QUOTENAME(@parentColumnName) + ' = rt.' + QUOTENAME(@referencedColumnName) + ');
        ';
        EXEC sp_executesql @sql;
        FETCH NEXT FROM cur INTO @tableName, @referencedTableName, @parentColumnName, @referencedColumnName;
      END;

      CLOSE cur;
      DEALLOCATE cur;

      SELECT * FROM #OrphanRecords;
    `;
    const result = await pool.request().query(query);
    logger.info(`Chequeo de datos huérfanos: ${JSON.stringify(result.recordset)}`);
    res.json({ result: result.recordset });
  } catch (error) {
    logger.error(`Error en chequeo de datos huérfanos: ${error.message}`);
    res.status(500).json({ message: "Error ejecutando chequeo" });
  }
});

// Chequeo 1: Datos Duplicados
router.get("/2", async (req, res) => {
    try {
      const pool = await connectToDatabase();
  
      const query = `
        IF OBJECT_ID('tempdb..#Duplicates') IS NOT NULL
          DROP TABLE #Duplicates;
  
        CREATE TABLE #Duplicates (
          TableName NVARCHAR(128),
          DuplicateCount INT
        );
  
        DECLARE @tableName NVARCHAR(128);
        DECLARE @sql NVARCHAR(MAX);
  
        DECLARE table_cursor CURSOR FOR
        SELECT t.name
        FROM sys.tables AS t
        WHERE t.is_ms_shipped = 0;
  
        OPEN table_cursor;
  
        FETCH NEXT FROM table_cursor INTO @tableName;
  
        WHILE @@FETCH_STATUS = 0
        BEGIN
          -- Obtener columnas de la tabla
          DECLARE @columns NVARCHAR(MAX);
          SELECT @columns = STRING_AGG(QUOTENAME(c.name), ', ')
          FROM sys.columns AS c
          WHERE c.object_id = OBJECT_ID(@tableName);
  
          -- Construir consulta dinámica para buscar duplicados
          SET @sql = '
            INSERT INTO #Duplicates (TableName, DuplicateCount)
            SELECT ''' + @tableName + ''', COUNT(*)
            FROM ' + QUOTENAME(@tableName) + '
            GROUP BY ' + @columns + '
            HAVING COUNT(*) > 1;
          ';
  
          EXEC sp_executesql @sql;
          FETCH NEXT FROM table_cursor INTO @tableName;
        END;
  
        CLOSE table_cursor;
        DEALLOCATE table_cursor;
  
        SELECT * FROM #Duplicates;
      `;
  
      const result = await pool.request().query(query);
      logger.info(`Chequeo de datos duplicados: ${JSON.stringify(result.recordset)}`);
      res.json({ result: result.recordset });
    } catch (error) {
      logger.error(`Error en chequeo de datos duplicados: ${error.message}`);
      res.status(500).json({ message: "Error ejecutando chequeo" });
    }
  });
  

// Chequeo 3: Cumplir Foreign Key
router.get("/3", async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const query = `
      SELECT fk.name AS ConstraintName, 
             t.name AS TableName
      FROM sys.foreign_keys AS fk
      INNER JOIN sys.tables AS t ON fk.parent_object_id = t.object_id
      WHERE NOT EXISTS (
        SELECT 1 FROM sys.foreign_key_columns AS fkc
        WHERE fkc.constraint_object_id = fk.object_id
      );
    `;
    const result = await pool.request().query(query);
    logger.info(`Chequeo de Foreign Key: ${JSON.stringify(result.recordset)}`);
    res.json({ result: result.recordset });
  } catch (error) {
    logger.error(`Error en chequeo de Foreign Key: ${error.message}`);
    res.status(500).json({ message: "Error ejecutando chequeo" });
  }
});

// Chequeo 4: Integridad referencial (eliminación y actualización)
router.get("/4", async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const query = `
      SELECT fk.name AS ForeignKeyName,
             tp.name AS ParentTable,
             tr.name AS ReferencedTable,
             fk.delete_referential_action_desc AS DeleteAction,
             fk.update_referential_action_desc AS UpdateAction
      FROM sys.foreign_keys AS fk
      INNER JOIN sys.tables AS tp ON fk.parent_object_id = tp.object_id
      INNER JOIN sys.tables AS tr ON fk.referenced_object_id = tr.object_id
      WHERE fk.delete_referential_action_desc NOT IN ('CASCADE', 'NO_ACTION')
         OR fk.update_referential_action_desc NOT IN ('CASCADE', 'NO_ACTION');
    `;
    const result = await pool.request().query(query);
    logger.info(`Chequeo de integridad referencial (eliminación y actualización): ${JSON.stringify(result.recordset)}`);
    res.json({ result: result.recordset });
  } catch (error) {
    logger.error(`Error en chequeo de integridad referencial (eliminación y actualización): ${error.message}`);
    res.status(500).json({ message: "Error ejecutando chequeo" });
  }
});

// Chequeo 5: Integridad referencial (inserción)
router.get("/5", async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const query = `
      SELECT fk.name AS ForeignKeyName,
             tp.name AS ParentTable,
             tr.name AS ReferencedTable,
             pc.name AS ParentColumn,
             pc.is_nullable AS IsNullable
      FROM sys.foreign_keys AS fk
      INNER JOIN sys.tables AS tp ON fk.parent_object_id = tp.object_id
      INNER JOIN sys.tables AS tr ON fk.referenced_object_id = tr.object_id
      INNER JOIN sys.foreign_key_columns AS fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns AS pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
      WHERE pc.is_nullable = 1;
    `;
    const result = await pool.request().query(query);
    logger.info(`Chequeo de integridad referencial (inserción): ${JSON.stringify(result.recordset)}`);
    res.json({ result: result.recordset });
  } catch (error) {
    logger.error(`Error en chequeo de integridad referencial (inserción): ${error.message}`);
    res.status(500).json({ message: "Error ejecutando chequeo" });
  }
});

// Chequeo 6: Claves primarias
router.get("/6", async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const query = `
      SELECT t.name AS TableName,
             CASE WHEN i.object_id IS NULL THEN 'No Primary Key' ELSE 'Has Primary Key' END AS PrimaryKeyStatus
      FROM sys.tables AS t
      LEFT JOIN sys.indexes AS i ON t.object_id = i.object_id AND i.is_primary_key = 1;
    `;
    const result = await pool.request().query(query);
    logger.info(`Chequeo de claves primarias: ${JSON.stringify(result.recordset)}`);
    res.json({ result: result.recordset });
  } catch (error) {
    logger.error(`Error en chequeo de claves primarias: ${error.message}`);
    res.status(500).json({ message: "Error ejecutando chequeo" });
  }
});

// Chequeo 7: Triggers
router.get("/7", async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const query = `
      SELECT tr.name AS TriggerName,
             tp.name AS ParentTable,
             OBJECT_NAME(tr.parent_id) AS TableName,
             m.definition AS TriggerDefinition
      FROM sys.triggers AS tr
      INNER JOIN sys.tables AS tp ON tr.parent_id = tp.object_id
      INNER JOIN sys.sql_modules AS m ON tr.object_id = m.object_id
      WHERE tr.is_ms_shipped = 0;
    `;
    const result = await pool.request().query(query);
    logger.info(`Chequeo de triggers: ${JSON.stringify(result.recordset)}`);
    res.json({ result: result.recordset });
  } catch (error) {
    logger.error(`Error en chequeo de triggers: ${error.message}`);
    res.status(500).json({ message: "Error ejecutando chequeo" });
  }
});

// Chequeo 8: Relaciones que deberían existir
router.get("/8", async (req, res) => {
    try {
      const pool = await connectToDatabase();
      const query = `
        SELECT tp.name AS ParentTable,
               cp.name AS ParentColumn,
               'PotentialReferencedTable' = REPLACE(cp.name, '_id', '')
        FROM sys.columns AS cp
        INNER JOIN sys.tables AS tp ON cp.object_id = tp.object_id
        LEFT JOIN sys.foreign_key_columns AS fkc ON cp.column_id = fkc.parent_column_id AND cp.object_id = fkc.parent_object_id
        WHERE cp.name LIKE '%_id' AND fkc.constraint_object_id IS NULL;
      `;
      const result = await pool.request().query(query);
      logger.info(`Chequeo de relaciones que deberían existir: ${JSON.stringify(result.recordset)}`);
      res.json({ result: result.recordset });
    } catch (error) {
      logger.error(`Error en chequeo de relaciones que deberían existir: ${error.message}`);
      res.status(500).json({ message: "Error ejecutando chequeo" });
    }
  });
  
  // Chequeo 9: Relaciones existentes (Foreign Keys)
  router.get("/9", async (req, res) => {
    try {
      const pool = await connectToDatabase();
      const query = `
        SELECT fk.name AS ForeignKeyName,
               tp.name AS ParentTable,
               cp.name AS ParentColumn,
               tr.name AS ReferencedTable,
               cr.name AS ReferencedColumn
        FROM sys.foreign_keys AS fk
        INNER JOIN sys.foreign_key_columns AS fkc ON fk.object_id = fkc.constraint_object_id
        INNER JOIN sys.tables AS tp ON fk.parent_object_id = tp.object_id
        INNER JOIN sys.columns AS cp ON fkc.parent_column_id = cp.column_id AND tp.object_id = cp.object_id
        INNER JOIN sys.tables AS tr ON fk.referenced_object_id = tr.object_id
        INNER JOIN sys.columns AS cr ON fkc.referenced_column_id = cr.column_id AND tr.object_id = cr.object_id;
      `;
      const result = await pool.request().query(query);
      logger.info(`Chequeo de relaciones existentes: ${JSON.stringify(result.recordset)}`);
      res.json({ result: result.recordset });
    } catch (error) {
      logger.error(`Error en chequeo de relaciones existentes: ${error.message}`);
      res.status(500).json({ message: "Error ejecutando chequeo" });
    }
  });
  
  export default router;