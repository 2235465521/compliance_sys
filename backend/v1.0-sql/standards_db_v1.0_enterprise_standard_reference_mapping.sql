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
-- Table structure for table `enterprise_standard_reference_mapping`
--

DROP TABLE IF EXISTS `enterprise_standard_reference_mapping`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enterprise_standard_reference_mapping` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `qb_code` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '企标号',
  `referenced_std_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '引用国标号',
  `latest_std_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国标最新版本号',
  `supplement_std_version_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '补充国标版本号',
  `manual_review_status` tinyint(1) DEFAULT NULL COMMENT '人工审核状态',
  PRIMARY KEY (`id`),
  KEY `idx_esrm_qb_code` (`qb_code`),
  CONSTRAINT `fk_esrm_qb_code` FOREIGN KEY (`qb_code`) REFERENCES `enterprise_standard_basic` (`qb_code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='企标映射表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enterprise_standard_reference_mapping`
--

LOCK TABLES `enterprise_standard_reference_mapping` WRITE;
/*!40000 ALTER TABLE `enterprise_standard_reference_mapping` DISABLE KEYS */;
/*!40000 ALTER TABLE `enterprise_standard_reference_mapping` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-22 10:52:09
