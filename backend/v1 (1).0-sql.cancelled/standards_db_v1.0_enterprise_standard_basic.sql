-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: standards_db_v1.0
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `enterprise_standard_basic`
--

DROP TABLE IF EXISTS `enterprise_standard_basic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enterprise_standard_basic` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `qb_code` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '企标号（与映射表外键类型一致）',
  `company_name` text COLLATE utf8mb4_unicode_ci COMMENT '企业名称',
  `qb_name` text COLLATE utf8mb4_unicode_ci COMMENT '企标名称',
  `publish_date` date DEFAULT NULL COMMENT '发布日期',
  `unified_social_credit_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '统一社会信用代码',
  `indicator_set_json` json DEFAULT NULL COMMENT '指标集合',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enterprise_standard_basic_qb_code` (`qb_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企标基础信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enterprise_standard_basic`
--

LOCK TABLES `enterprise_standard_basic` WRITE;
/*!40000 ALTER TABLE `enterprise_standard_basic` DISABLE KEYS */;
/*!40000 ALTER TABLE `enterprise_standard_basic` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-23 19:52:05
