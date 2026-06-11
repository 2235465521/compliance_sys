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
-- Table structure for table `standard_document_catalog`
--

DROP TABLE IF EXISTS `standard_document_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `standard_document_catalog` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `std_name` text COLLATE utf8mb4_unicode_ci COMMENT '标准名称',
  `std_code` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国标号',
  `core_keywords` text COLLATE utf8mb4_unicode_ci COMMENT '关键词',
  `content_text` text COLLATE utf8mb4_unicode_ci COMMENT '正文',
  `scope_vector` json DEFAULT NULL COMMENT '语义向量',
  `embedding_model` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '向量模型名',
  PRIMARY KEY (`id`),
  KEY `idx_standard_document_catalog_std_code` (`std_code`),
  CONSTRAINT `fk_sdc_std_code` FOREIGN KEY (`std_code`) REFERENCES `national_standard_basic` (`std_code`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='正文目录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `standard_document_catalog`
--

LOCK TABLES `standard_document_catalog` WRITE;
/*!40000 ALTER TABLE `standard_document_catalog` DISABLE KEYS */;
/*!40000 ALTER TABLE `standard_document_catalog` ENABLE KEYS */;
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
