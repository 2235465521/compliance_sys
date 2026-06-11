-- MySQL dump — table std_scope_table aligned with standards_db_v1.0
--
-- 与旧库对照：
--   旧列 bz_id（存国标号字符串） → 本表 std_code，与 national_standard_basic.std_code 一致
--   base_id 含义不变：对应 national_standard_basic.id（可为空）
--
-- 导入旧 dump 数据时：INSERT 均为按列顺序 VALUES(...)，列顺序与旧表一致
--   (id, 第2列国标号, base_id, scope_text, core_keywords, scope_vector)
-- 因此只需「先执行本文件建表」，再从旧文件中单独执行 INSERT 段即可（勿执行旧文件里的 DROP/CREATE）。

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

DROP TABLE IF EXISTS `std_scope_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `std_scope_table` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `std_code` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国标号（原 bz_id），对齐 national_standard_basic.std_code',
  `base_id` bigint DEFAULT NULL COMMENT 'national_standard_basic.id',
  `scope_text` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '适用范围正文',
  `core_keywords` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关键词',
  `scope_vector` json DEFAULT NULL COMMENT '语义向量',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_std_scope_std_code` (`std_code`),
  KEY `idx_std_scope_base_id` (`base_id`),
  CONSTRAINT `fk_std_scope_std_code` FOREIGN KEY (`std_code`) REFERENCES `national_standard_basic` (`std_code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国标适用范围与向量（查重二审）';
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
