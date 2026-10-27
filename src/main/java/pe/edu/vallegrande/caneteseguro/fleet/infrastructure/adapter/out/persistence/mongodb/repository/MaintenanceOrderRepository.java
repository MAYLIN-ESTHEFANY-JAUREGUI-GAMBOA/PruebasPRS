package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.repository;

import org.springframework.data.mongodb.repository.ReactiveMongoRepository;
import org.springframework.stereotype.Repository;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document.MaintenanceOrderDocument;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Collection;

/**
 * Spring Data Reactive MongoDB repository for maintenance orders.
 * REC-02/03 compliant: extends ReactiveMongoRepository, returns Mono/Flux publishers.
 * TEN-01/02 compliant: queries partitioned by entityId and active status.
 */
@Repository
public interface MaintenanceOrderRepository extends ReactiveMongoRepository<MaintenanceOrderDocument, String> {

    Mono<MaintenanceOrderDocument> findByOrderCode(String orderCode);

    Flux<MaintenanceOrderDocument> findByResourceId(String resourceId);

    Flux<MaintenanceOrderDocument> findByEntityId(String entityId);

    Flux<MaintenanceOrderDocument> findByOrderStatus(String orderStatus);

    Flux<MaintenanceOrderDocument> findByEntityIdAndOrderStatus(String entityId, String orderStatus);

    Mono<Boolean> existsByResourceIdAndOrderStatusNotIn(String resourceId, Collection<String> orderStatuses);
}
