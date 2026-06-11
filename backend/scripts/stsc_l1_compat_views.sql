-- STSC L1 只读兼容视图（供 reference_resolution 等未改动的 v1 表名读路径使用）
-- 在 STSC_standard_database 上由 DBA 执行；应用 L3 改造不依赖本脚本，但 Step3 查新需要。

-- 国标主表兼容：std_id → std_code
CREATE OR REPLACE VIEW national_standard_basic AS
SELECT
    b.id,
    b.std_id AS std_code,
    b.std_chinesename AS std_name,
    b.std_status,
    b.release_date AS publish_date,
    b.implement_date AS effective_date,
    b.abolish_date AS abolition_date,
    b.std_type AS std_category,
    NULL AS replaces_std_code,
    NULL AS replace_type,
    d.ics_code AS ics_code,
    d.ccs_code AS ccs_code,
    p.ped_id AS ped_id,
    NULL AS detail_url,
    f.file_path AS std_file_path,
    b.ex_state
FROM std_base b
LEFT JOIN std_gb_detail d ON d.base_id = b.id
LEFT JOIN std_pedigree p ON p.base_id = b.id
LEFT JOIN (
    SELECT base_id, MIN(file_path) AS file_path
    FROM std_filepath
    GROUP BY base_id
) f ON f.base_id = b.id;

-- 谱系兼容：std_id_latest → latest_std_code；链 JSON 在 std_ped_chain
CREATE OR REPLACE VIEW standard_pedigree AS
SELECT
    p.id,
    b.std_id AS std_code,
    p.std_id_latest AS latest_std_code,
    p.ped_id,
    COALESCE(c.chain_json, '') AS part_chain
FROM std_pedigree p
JOIN std_base b ON b.id = p.base_id
LEFT JOIN std_ped_chain c ON c.ped_id = p.ped_id;
