/**
 * Database.gs
 * Camada de acesso ao Neon PostgreSQL via serviço Jdbc do Apps Script.
 *
 * Decisões documentadas:
 * - Toda instrução usa PreparedStatement com parâmetros tipados (nunca
 *   concatenação de string vinda do usuário). Para colunas ENUM do Postgres,
 *   as chamadas em src/services/*.gs escrevem o placeholder com cast
 *   explícito (ex.: `?::account_status`) — o valor em si continua vindo
 *   como parâmetro ligado, isso é apenas a forma de o Postgres aceitar um
 *   bind de texto contra um tipo enumerado customizado.
 * - Conexão, PreparedStatement e ResultSet são sempre fechados em blocos
 *   finally, em todos os caminhos (sucesso ou exceção).
 * - withTransaction() usa setAutoCommit(false) + commit()/rollback() para
 *   operações que exigem atomicidade multi-tabela (cadastro com consentimento
 *   e preferências, consumo de token, voto, alterações administrativas).
 * - Esta camada NÃO decide mensagens de erro para o usuário final — apenas
 *   propaga a exceção. A tradução para mensagem genérica/segura acontece em
 *   Code.gs (ver App.Errors e App.Logging).
 */
App.Database = (function () {
  function connect() {
    return Jdbc.getConnection(App.Config.getDbUrl(), App.Config.getDbUser(), App.Config.getDbPassword());
  }

  function bindParams(stmt, params) {
    (params || []).forEach(function (value, idx) {
      const i = idx + 1;
      if (value === null || value === undefined) {
        stmt.setNull(i, Jdbc.Types.VARCHAR);
      } else if (typeof value === 'boolean') {
        stmt.setBoolean(i, value);
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          stmt.setInt(i, value);
        } else {
          stmt.setDouble(i, value);
        }
      } else if (Object.prototype.toString.call(value) === '[object Date]') {
        stmt.setString(i, value.toISOString());
      } else {
        stmt.setString(i, String(value));
      }
    });
  }

  function readValue(rs, columnIndex, typeName) {
    const lowerType = String(typeName || '').toLowerCase();
    if (lowerType === 'bool') {
      const v = rs.getBoolean(columnIndex);
      return rs.wasNull ? (rs.wasNull() ? null : v) : v;
    }
    if (lowerType === 'timestamptz' || lowerType === 'timestamp' || lowerType === 'date') {
      const ts = rs.getTimestamp(columnIndex);
      return ts ? new Date(ts.getTime()).toISOString() : null;
    }
    if (lowerType === 'int2' || lowerType === 'int4' || lowerType === 'int8' || lowerType === 'numeric' || lowerType === 'float4' || lowerType === 'float8') {
      const s = rs.getString(columnIndex);
      return s === null ? null : Number(s);
    }
    return rs.getString(columnIndex);
  }

  function rowsFromResultSet(rs) {
    const meta = rs.getMetaData();
    const columnCount = meta.getColumnCount();
    const labels = [];
    const types = [];
    for (let i = 1; i <= columnCount; i++) {
      labels.push(meta.getColumnLabel(i));
      types.push(meta.getColumnTypeName(i));
    }

    const rows = [];
    while (rs.next()) {
      const row = {};
      for (let i = 0; i < columnCount; i++) {
        row[labels[i]] = readValue(rs, i + 1, types[i]);
      }
      rows.push(row);
    }
    return rows;
  }

  function runQuery(conn, sql, params) {
    const stmt = conn.prepareStatement(sql);
    try {
      bindParams(stmt, params);
      const rs = stmt.executeQuery();
      try {
        return rowsFromResultSet(rs);
      } finally {
        rs.close();
      }
    } finally {
      stmt.close();
    }
  }

  function runUpdate(conn, sql, params) {
    const stmt = conn.prepareStatement(sql);
    try {
      bindParams(stmt, params);
      return stmt.executeUpdate();
    } finally {
      stmt.close();
    }
  }

  function withConnection(callback) {
    const conn = connect();
    try {
      return callback(conn);
    } finally {
      try {
        conn.close();
      } catch (closeErr) {
        // Conexão pode já estar fechada; não há ação corretiva possível aqui.
      }
    }
  }

  function query(sql, params) {
    return withConnection(function (conn) {
      return runQuery(conn, sql, params);
    });
  }

  function execute(sql, params) {
    return withConnection(function (conn) {
      return runUpdate(conn, sql, params);
    });
  }

  /**
   * callback recebe { query(sql, params), execute(sql, params) } vinculados à
   * MESMA conexão/transação. Commit automático ao final; rollback automático
   * se o callback lançar qualquer exceção (que é relançada para o chamador).
   */
  function withTransaction(callback) {
    return withConnection(function (conn) {
      conn.setAutoCommit(false);
      try {
        const txn = {
          query: function (sql, params) {
            return runQuery(conn, sql, params);
          },
          execute: function (sql, params) {
            return runUpdate(conn, sql, params);
          },
        };
        const result = callback(txn);
        conn.commit();
        return result;
      } catch (err) {
        try {
          conn.rollback();
        } catch (rollbackErr) {
          // Se o rollback falhar, a conexão será fechada de qualquer forma no finally externo.
        }
        throw err;
      } finally {
        try {
          conn.setAutoCommit(true);
        } catch (resetErr) {
          // Conexão será fechada em seguida; nada mais a fazer.
        }
      }
    });
  }

  return {
    query: query,
    execute: execute,
    withTransaction: withTransaction,
  };
})();
