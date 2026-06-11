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
-- Table structure for table `compliance_evaluation_task`
--

DROP TABLE IF EXISTS `compliance_evaluation_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `compliance_evaluation_task` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `qb_code` varchar(128) DEFAULT NULL,
  `current_step` smallint unsigned NOT NULL,
  `status` varchar(16) NOT NULL,
  `uploaded_file_path` longtext,
  `uploaded_file_name` varchar(512) DEFAULT NULL,
  `parse_result_json` json DEFAULT NULL,
  `indicator_bundle_json` json DEFAULT NULL,
  `compare_result_json` json DEFAULT NULL,
  `dify_run_metadata_json` json DEFAULT NULL,
  `step4_indicators_confirmed` tinyint(1) NOT NULL,
  `step5_compare_confirmed` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `created_by` varchar(128) DEFAULT NULL,
  `parse_error` longtext,
  `parse_status` varchar(24) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `compliance_evaluation_task_qb_code_aa068f20` (`qb_code`),
  KEY `compliance_evaluation_task_parse_status_c1166d7d` (`parse_status`),
  CONSTRAINT `compliance_evaluation_task_chk_1` CHECK ((`current_step` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `compliance_evaluation_task`
--

LOCK TABLES `compliance_evaluation_task` WRITE;
/*!40000 ALTER TABLE `compliance_evaluation_task` DISABLE KEYS */;
/*!40000 ALTER TABLE `compliance_evaluation_task` ENABLE KEYS */;
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
